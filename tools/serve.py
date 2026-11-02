#!/usr/bin/env python3
"""Serve the local DAgger review report and seekable videos on loopback only.

Only files within the selected report directory and MP4 symlinks targeting the
authorized original video directory can be read. Directory listings and writes
are not provided. Videos are streamed in bounded blocks, including byte ranges.
"""

from __future__ import annotations

import argparse
from functools import partial
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import ipaddress
import mimetypes
import os
from pathlib import Path
import re
import socket
import stat
from urllib.parse import unquote, urlsplit


DEFAULT_DIRECTORY = Path(__file__).resolve().parents[1] / "web"
TRANSFER_BLOCK_BYTES = 128 * 1024


class UnsatisfiableRange(ValueError):
    """The request is not a supported, satisfiable single byte range."""


class InvalidRequestPath(ValueError):
    def __init__(self, status: HTTPStatus, message: str):
        super().__init__(message)
        self.status = status


def parse_byte_range(value: str | None, size: int) -> tuple[int, int] | None:
    """Return inclusive byte endpoints, or None when no Range was requested."""
    if value is None:
        return None
    match = re.fullmatch(
        r"bytes\s*=\s*([0-9]*)\s*-\s*([0-9]*)", value.strip(), re.IGNORECASE
    )
    if match is None or size <= 0:
        raise UnsatisfiableRange("Only one satisfiable bytes range is supported")
    first, last = match.groups()
    if not first and not last:
        raise UnsatisfiableRange("Empty byte range")
    if not first:
        suffix_length = int(last)
        if suffix_length <= 0:
            raise UnsatisfiableRange("Empty suffix byte range")
        return max(0, size - suffix_length), size - 1
    start = int(first)
    stop = int(last) if last else size - 1
    if start >= size or stop < start:
        raise UnsatisfiableRange("Byte range lies outside the file")
    return start, min(stop, size - 1)


def resolve_request_path(
    request_target: str, directory: Path, authorized_videos: Path
) -> Path:
    """Decode once, reject ambiguous/traversal paths, then enforce target roots."""
    if not request_target.startswith("/") or any(
        ord(character) < 32 or ord(character) == 127 for character in request_target
    ):
        raise InvalidRequestPath(HTTPStatus.BAD_REQUEST, "Invalid request target")
    try:
        parts = urlsplit(request_target)
        if parts.scheme or parts.netloc or parts.fragment:
            raise ValueError("Only origin-form paths are accepted")
        decoded = unquote(parts.path, encoding="utf-8", errors="strict")
    except (UnicodeDecodeError, ValueError) as error:
        raise InvalidRequestPath(HTTPStatus.BAD_REQUEST, "Invalid URL path") from error
    if "%" in decoded or any(
        ord(character) < 32 or ord(character) == 127 for character in decoded
    ):
        raise InvalidRequestPath(
            HTTPStatus.BAD_REQUEST, "Ambiguous or invalid path encoding"
        )
    if "\\" in decoded:
        raise InvalidRequestPath(HTTPStatus.FORBIDDEN, "Backslashes are not permitted")
    if decoded == "/":
        relative = Path("index.html")
    else:
        components = decoded.split("/")[1:]
        # Validate the decoded components before Path can normalize away dots.
        if any(component in {".", "..", ""} for component in components):
            raise InvalidRequestPath(
                HTTPStatus.FORBIDDEN, "Noncanonical paths are not permitted"
            )
        relative = Path(*components)
    unresolved = directory / relative
    try:
        resolved = unresolved.resolve(strict=True)
    except (FileNotFoundError, NotADirectoryError) as error:
        raise InvalidRequestPath(HTTPStatus.NOT_FOUND, "File not found") from error
    except (OSError, RuntimeError) as error:
        raise InvalidRequestPath(
            HTTPStatus.FORBIDDEN, "Unable to resolve file"
        ) from error
    if not resolved.is_relative_to(directory):
        authorized_video = (
            resolved.is_relative_to(authorized_videos)
            and resolved.suffix.lower() == ".mp4"
            and relative.suffix.lower() == ".mp4"
        )
        if not authorized_video:
            raise InvalidRequestPath(
                HTTPStatus.FORBIDDEN, "Symlink target is not authorized"
            )
    if not resolved.is_file():
        raise InvalidRequestPath(
            HTTPStatus.FORBIDDEN, "Directory listings are disabled"
        )
    return resolved


def loopback_host(value: str) -> str:
    if value.lower() == "localhost":
        return "127.0.0.1"
    try:
        address = ipaddress.ip_address(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError(
            "Use a literal loopback IP or localhost"
        ) from error
    if not address.is_loopback:
        raise argparse.ArgumentTypeError(
            "This review server only binds to loopback addresses"
        )
    return str(address)


def port_number(value: str) -> int:
    try:
        number = int(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("Port must be an integer") from error
    if not 0 <= number <= 65535:
        raise argparse.ArgumentTypeError("Port must be between 0 and 65535")
    return number


class ReviewRequestHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "DaggerReview/1.0"

    def __init__(self, *args, directory: Path, authorized_videos: Path, **kwargs):
        self.directory = directory
        self.authorized_videos = authorized_videos
        super().__init__(*args, **kwargs)

    def do_GET(self):
        self._serve_file(send_body=True)

    def do_HEAD(self):
        self._serve_file(send_body=False)

    def _range_error(self, size: int):
        self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
        self.send_header("Content-Range", f"bytes */{size}")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _serve_file(self, *, send_body: bool):
        try:
            path = resolve_request_path(
                self.path, self.directory, self.authorized_videos
            )
        except InvalidRequestPath as error:
            self.send_error(error.status, str(error))
            return
        try:
            # Do not follow a replaced leaf symlink after resolving its target.
            descriptor = os.open(
                path, os.O_RDONLY | os.O_NONBLOCK | getattr(os, "O_NOFOLLOW", 0)
            )
        except FileNotFoundError:
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return
        except OSError:
            self.send_error(HTTPStatus.FORBIDDEN, "File cannot be read")
            return
        with os.fdopen(descriptor, "rb") as stream:
            metadata = os.fstat(stream.fileno())
            if not stat.S_ISREG(metadata.st_mode):
                self.send_error(HTTPStatus.FORBIDDEN, "Only regular files can be read")
                return
            size = metadata.st_size
            range_headers = self.headers.get_all("Range", [])
            if len(range_headers) > 1:
                self._range_error(size)
                return
            range_value = range_headers[0] if range_headers else None
            try:
                selected_range = parse_byte_range(range_value, size)
            except (UnsatisfiableRange, ValueError):
                self._range_error(size)
                return
            start, end = selected_range if selected_range is not None else (0, size - 1)
            content_length = max(0, end - start + 1)
            content_type = (
                "video/mp4"
                if path.suffix.lower() == ".mp4"
                else mimetypes.guess_type(path.name)[0]
            )
            content_type = content_type or "application/octet-stream"
            if content_type.startswith("text/") or content_type == "application/json":
                content_type += "; charset=utf-8"
            self.send_response(
                HTTPStatus.PARTIAL_CONTENT
                if selected_range is not None
                else HTTPStatus.OK
            )
            self.send_header("Content-Type", content_type)
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Length", str(content_length))
            self.send_header("Last-Modified", self.date_time_string(metadata.st_mtime))
            self.send_header("Cache-Control", "no-cache")
            self.send_header("X-Content-Type-Options", "nosniff")
            if selected_range is not None:
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.end_headers()
            if not send_body:
                return
            stream.seek(start)
            remaining = content_length
            try:
                while remaining:
                    block = stream.read(min(remaining, TRANSFER_BLOCK_BYTES))
                    if not block:
                        break
                    self.wfile.write(block)
                    remaining -= len(block)
            except (BrokenPipeError, ConnectionResetError):
                # Seeking/cancelling a browser video routinely closes an old request.
                return


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=DEFAULT_DIRECTORY)
    parser.add_argument(
        "--video-root",
        type=Path,
        help="Allow MP4 symlinks to this local video directory",
    )
    parser.add_argument("--host", type=loopback_host, default="127.0.0.1")
    parser.add_argument("--port", type=port_number, default=8765)
    args = parser.parse_args()
    directory = args.directory.resolve(strict=True)
    if not directory.is_dir():
        parser.error("--directory must point to an existing directory")
    authorized_videos = (args.video_root or directory).resolve(strict=True)
    if not authorized_videos.is_dir():
        parser.error("--video-root must point to an existing directory")
    handler = partial(
        ReviewRequestHandler, directory=directory, authorized_videos=authorized_videos
    )
    server_class = type(
        "LoopbackReviewServer",
        (ThreadingHTTPServer,),
        {"address_family": socket.AF_INET6 if ":" in args.host else socket.AF_INET},
    )
    with server_class((args.host, args.port), handler) as server:
        actual_port = server.server_address[1]
        display_host = f"[{args.host}]" if ":" in args.host else args.host
        print(f"Review URL: http://{display_host}:{actual_port}/", flush=True)
        print(f"Report directory: {directory}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
