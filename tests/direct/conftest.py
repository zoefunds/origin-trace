import datetime
import json
import re


def warp_forward(direct_vm, seconds: int) -> None:
    """VMContext only exposes an absolute-ISO-timestamp `warp`, not a
    relative one -- this advances the VM clock forward by `seconds` from
    wherever it currently sits."""
    current = datetime.datetime.fromisoformat(direct_vm._datetime.replace("Z", "+00:00"))
    new_dt = current + datetime.timedelta(seconds=seconds)
    direct_vm.warp(new_dt.isoformat().replace("+00:00", "Z"))


def get_balance(direct_vm, address) -> int:
    """VMContext tracks balances in a private dict keyed by raw address
    bytes with no public getter -- this mirrors the same lookup `deal()`
    writes to."""
    return direct_vm._balances.get(direct_vm._to_bytes(address), 0)


def mock_wayback(direct_vm, domain_fragment: str, timestamp_yyyymmddhhmmss: str, available: bool = True):
    """Mocks the Internet Archive Availability API response for artifact
    URLs matching domain_fragment (a plain substring, e.g. "alice.example.com").

    The contract queries `https://archive.org/wayback/available?url=<artifact_url>`,
    which embeds the artifact's own domain inside its query string -- so the
    mock pattern is anchored to require an archive.org host prefix, never
    just a bare domain substring, otherwise it would also match the
    artifact-page fetch itself (see mock_artifact_page)."""
    body = {
        "archived_snapshots": (
            {"closest": {"available": True, "timestamp": timestamp_yyyymmddhhmmss, "status": "200"}}
            if available
            else {}
        )
    }
    pattern = r"^https://archive\.org/wayback/available\?url=.*" + re.escape(domain_fragment)
    direct_vm.mock_web(pattern, {"status": 200, "body": json.dumps(body)})


def mock_git_commit(direct_vm, url_pattern: str, iso_date: str):
    """Mocks a GitHub commit API response shape consumed by
    _extract_git_commit_timestamp."""
    body = {"commit": {"committer": {"date": iso_date}}}
    direct_vm.mock_web(url_pattern, {"status": 200, "body": json.dumps(body)})


def mock_artifact_page(direct_vm, domain_fragment: str, text: str):
    """Mocks the artifact page fetch itself. Anchored to the START of the
    URL so it can never accidentally match a different host's wayback
    query string that happens to embed this domain as a parameter."""
    pattern = (
        domain_fragment
        if domain_fragment.startswith("^")
        else r"^https://[^/]*" + re.escape(domain_fragment)
    )
    direct_vm.mock_web(pattern, {"status": 200, "body": text})


def mock_match_score(direct_vm, score_bps: int, notes: str = "matches"):
    """Mocks the substantive-match LLM call. The contract's prompt always
    contains the literal phrase 'SUBSTANTIVE MATCH RUBRIC', which is a
    stable anchor to target with the mock regex regardless of the rest of
    the prompt content (idea title/description vary per test)."""
    direct_vm.mock_llm(
        r".*SUBSTANTIVE MATCH RUBRIC.*",
        json.dumps({"match_score_bps": score_bps, "notes": notes}),
    )
