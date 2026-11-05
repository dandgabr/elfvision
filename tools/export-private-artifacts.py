#!/usr/bin/env python3
"""Export regular private-session artifacts without following destination symlinks."""
import os
import secrets
import stat
import shutil
import sys
from pathlib import Path

work, log, destination = sys.argv[1:]
flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW


def copy_file(source, parent_fd, name):
    source_fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        if not stat.S_ISREG(os.fstat(source_fd).st_mode):
            raise ValueError(f'not a regular artifact: {source}')
        temporary = '.gaq-' + secrets.token_hex(16)
        target_fd = os.open(temporary, flags, 0o600, dir_fd=parent_fd)
        try:
            with os.fdopen(target_fd, 'wb') as target, os.fdopen(source_fd, 'rb') as src:
                source_fd = -1
                shutil.copyfileobj(src, target)
            os.replace(temporary, name, src_dir_fd=parent_fd, dst_dir_fd=parent_fd)
        finally:
            try:
                os.unlink(temporary, dir_fd=parent_fd)
            except FileNotFoundError:
                pass
    finally:
        if source_fd != -1:
            os.close(source_fd)


if log and Path(work, 'shell.log').exists():
    parent = os.open(os.path.dirname(os.path.abspath(log)), os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        copy_file(Path(work, 'shell.log'), parent, os.path.basename(log))
    finally:
        os.close(parent)

if destination:
    os.makedirs(destination, mode=0o700, exist_ok=True)
    root_fd = os.open(destination, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for base, dirs, files in os.walk(Path(work, 'captures'), followlinks=False):
            relative = Path(base).relative_to(Path(work, 'captures'))
            fd = os.dup(root_fd)
            try:
                for part in relative.parts:
                    try:
                        os.mkdir(part, 0o700, dir_fd=fd)
                    except FileExistsError:
                        pass
                    next_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                    os.close(fd)
                    fd = next_fd
                if any(Path(base, name).is_symlink() for name in dirs):
                    raise ValueError('symlink in private artifacts')
                for name in files:
                    copy_file(Path(base, name), fd, name)
            finally:
                os.close(fd)
    finally:
        os.close(root_fd)
