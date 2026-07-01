import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.config import parse_github_repo

SUCCESS_CASES = [
    ("vercel/ms", "vercel/ms"),
    ("https://github.com/vercel/ms", "vercel/ms"),
    ("https://github.com/vercel/ms.git", "vercel/ms"),
    ("https://github.com/vercel/ms/", "vercel/ms"),
    ("git@github.com:vercel/ms.git", "vercel/ms"),
    (" vercel/ms ", "vercel/ms"),
]

FAILURE_CASES = [
    "",
    "just-a-string",
    "too/many/slashes",
    "invalid chars/repo!",
    "https://gitlab.com/owner/repo",
]


def main():
    failures = 0

    for input_value, expected in SUCCESS_CASES:
        try:
            result = parse_github_repo(input_value)
            if result == expected:
                print(f"PASS: parse_github_repo({input_value!r}) == {result!r}")
            else:
                print(
                    f"FAIL: parse_github_repo({input_value!r}) == {result!r}, "
                    f"expected {expected!r}"
                )
                failures += 1
        except ValueError as e:
            print(f"FAIL: parse_github_repo({input_value!r}) raised ValueError unexpectedly: {e}")
            failures += 1

    for input_value in FAILURE_CASES:
        try:
            result = parse_github_repo(input_value)
            print(
                f"FAIL: parse_github_repo({input_value!r}) should have raised "
                f"ValueError, got {result!r}"
            )
            failures += 1
        except ValueError as e:
            print(f"PASS: parse_github_repo({input_value!r}) raised ValueError: {e}")

    if failures:
        print(f"\n{failures} case(s) failed.")
        sys.exit(1)

    print("\nAll cases passed.")


if __name__ == "__main__":
    main()
