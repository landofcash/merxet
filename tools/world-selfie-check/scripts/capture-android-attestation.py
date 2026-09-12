"""Capture World Sandbox attestation diagnostics without printing raw tokens."""

import base64
import json
import re
import subprocess
import threading


ADB = r"C:\tools\platform-tools\adb.exe"
ENDPOINT = "https://attestation.sandbox.worldcoin.org/g"


def emit(event, **details):
    print(json.dumps({"event": event, **details}), flush=True)


def token_summary(body, nonce):
    token = body.get("integrity_token")
    if not isinstance(token, str):
        return {"token_present": False}
    parts = token.split(".")
    result = {
        "token_present": True,
        "segment_count": len(parts),
        "contains_whitespace": bool(re.search(r"\s", token)),
        "base64url_segments": all(
            bool(re.fullmatch(r"[A-Za-z0-9_-]+", part)) for part in parts
        ),
        "sandbox_bundle_matches": body.get("bundle_identifier") == "org.world.id.sandbox",
        "audience_matches": body.get("aud") == "toolsforhumanity.com",
        "request_hash_matches_google_nonce": (
            body.get("request_hash") == nonce if nonce is not None else None
        ),
    }
    try:
        decoded = [
            base64.b64decode(part + "=" * (-len(part) % 4), altchars=b"-_", validate=True)
            for part in parts
        ]
        header = json.loads(decoded[0])
        result.update(
            expected_alg=header.get("alg") == "A256KW",
            expected_enc=header.get("enc") == "A256GCM",
            decoded_segment_lengths=[len(part) for part in decoded],
        )
    except (ValueError, TypeError, IndexError, AttributeError):
        result["decodable_header_and_segments"] = False
    return result


def main():
    # Read only new log entries. Raw lines and tokens remain in process memory.
    process = subprocess.Popen(
        [ADB, "-d", "logcat", "-v", "threadtime", "-T", "1"],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    timer = threading.Timer(900, process.terminate)
    timer.daemon = True
    timer.start()
    nonces = {}
    active = set()
    emit("capture_started", maximum_minutes=15, raw_tokens_logged=False)
    try:
        for line in process.stdout:
            match = re.match(r"(\S+\s+\S+)\s+(\d+)\s+(\d+)\s+\S\s+(.*)", line)
            if not match:
                continue
            timestamp, pid, tid, remainder = match.groups()
            nonce_match = re.search(r"IntegrityTokenRequest\{nonce=([^,}]+)", remainder)
            if nonce_match:
                nonces[pid] = nonce_match.group(1)
            if not remainder.startswith("OkHttp"):
                continue
            body = remainder.split(": ", 1)[-1].strip()
            thread = (pid, tid)
            if body.startswith("--> POST " + ENDPOINT):
                active.add(thread)
                emit("gateway_request", phone_time=timestamp, endpoint=ENDPOINT)
                continue
            if thread not in active:
                continue
            if body.startswith("--> ") and not body.startswith("--> END"):
                active.discard(thread)
                continue
            status = re.match(r"<-- (\d{3}) ", body)
            if status:
                emit("gateway_status", phone_time=timestamp, status=int(status.group(1)))
            header = re.match(
                r"(?i)(x-request-id|x-correlation-id|traceparent|x-amzn-trace-id|cf-ray|date|server):\s*(.*)",
                body,
            )
            if header:
                emit("response_header", name=header.group(1), value=header.group(2)[:250])
            if body.startswith("{"):
                try:
                    data = json.loads(body)
                except ValueError:
                    continue
                if not isinstance(data, dict):
                    continue
                if "integrity_token" in data:
                    emit("token_structure", **token_summary(data, nonces.get(pid)))
                if isinstance(data.get("error"), dict):
                    code = data["error"].get("code")
                    emit(
                        "gateway_error",
                        code=code if isinstance(code, str) and re.fullmatch(r"[a-z_]{1,60}", code) else "unrecognized",
                        allow_retry=data.get("allowRetry") if isinstance(data.get("allowRetry"), bool) else None,
                        standard_invalid_token_message=data["error"].get("message")
                        == "The provided token or attestation is invalid or malformed.",
                        extra_error_field_count=len(set(data["error"]) - {"code", "message"}),
                    )
            if body.startswith("<-- END HTTP"):
                active.discard(thread)
    except KeyboardInterrupt:
        pass
    finally:
        timer.cancel()
        if process.poll() is None:
            process.terminate()
        process.wait()
        emit("capture_stopped")


if __name__ == "__main__":
    main()
