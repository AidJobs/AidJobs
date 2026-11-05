"""The statement that sets a database role's password from its SCRAM-SHA-256 verifier.

Security plan, stage 6. PostgreSQL stores a password given in this form as it is, so the plain
password never reaches the database, its logs, or the Supabase SQL editor's history.

The password is read from standard input (scripts/set-db-role-password.ps1 pipes it in), or
from a prompt that does not echo. Only the statement is printed:

    ALTER ROLE aidjobs_readonly WITH PASSWORD 'SCRAM-SHA-256$4096:...';

The password must be 24 to 128 letters and digits: nothing to percent-encode in a connection
string, and nothing SASLprep (RFC 4013) would change before hashing.
"""

import argparse
import base64
import getpass
import hashlib
import hmac
import os
import re
import sys

ROLES = ("aidjobs_app", "aidjobs_readonly")
ITERATIONS = 4096
SALT_BYTES = 16
PASSWORD_SHAPE = re.compile(r"[A-Za-z0-9]{24,128}")


def scram_verifier(password: str, salt: bytes, iterations: int = ITERATIONS) -> str:
    """PostgreSQL's stored form of a SCRAM-SHA-256 password (RFC 5802, RFC 7677)."""
    if not PASSWORD_SHAPE.fullmatch(password):
        raise ValueError("the password must be 24 to 128 letters and digits")
    salted = hashlib.pbkdf2_hmac("sha256", password.encode("ascii"), salt, iterations)
    client_key = hmac.new(salted, b"Client Key", hashlib.sha256).digest()
    stored_key = hashlib.sha256(client_key).digest()
    server_key = hmac.new(salted, b"Server Key", hashlib.sha256).digest()

    def b64(data: bytes) -> str:
        return base64.b64encode(data).decode("ascii")

    return f"SCRAM-SHA-256${iterations}:{b64(salt)}${b64(stored_key)}:{b64(server_key)}"


def statement(role: str, password: str, salt: bytes | None = None) -> str:
    if role not in ROLES:
        raise ValueError(f"the role must be one of {', '.join(ROLES)}")
    verifier = scram_verifier(password, salt if salt is not None else os.urandom(SALT_BYTES))
    return f"ALTER ROLE {role} WITH PASSWORD '{verifier}';"


def main(argv=None, stdin=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--role", required=True, choices=ROLES)
    args = parser.parse_args(argv)
    stdin = stdin if stdin is not None else sys.stdin
    if stdin.isatty():
        password = getpass.getpass("Password (not shown): ")
    else:
        # Windows PowerShell can start piped text with a byte-order mark.
        password = stdin.readline().lstrip("\ufeff").strip()
    try:
        print(statement(args.role, password))
    except ValueError as e:
        print(f"refused: {e}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
