"""The outbound answer gate.

A real test call failed because the agent greeted a ringing line: the callee picked up,
heard nothing, and hung up. These cover the gate that fixes it. A SIP participant kind is
assigned by the LiveKit SIP service and cannot be faked, so the participant and the job
context are stubbed and the polling logic is tested directly.
"""

from __future__ import annotations

import asyncio

import main


class FakeParticipant:
    """A SIP participant whose call status advances on each read of `attributes`.

    Reading drives the sequence so the tests need no timing and never touch
    asyncio.sleep: patching that globally corrupted every other test in the suite.
    """

    def __init__(self, statuses: list[str | None]):
        self._statuses = statuses
        self._i = 0

    @property
    def attributes(self) -> dict[str, str]:
        value = self._statuses[min(self._i, len(self._statuses) - 1)]
        self._i += 1
        return {} if value is None else {main.SIP_STATUS_ATTR: value}


class FakeCtx:
    def __init__(self, participant, *, join_delay: float = 0.0, never_joins: bool = False):
        self._participant = participant
        self._join_delay = join_delay
        self._never_joins = never_joins

    async def wait_for_participant(self, *, kind=None, identity=None):
        if self._never_joins:
            await asyncio.Event().wait()   # never resolves; the caller must time out
        return self._participant


async def test_returns_true_once_the_call_goes_active():
    p = FakeParticipant(["dialing", "dialing", "active"])
    assert await main.wait_until_answered(FakeCtx(p), "+911234567890", poll_interval=0) is True


async def test_answered_immediately():
    p = FakeParticipant(["active"])
    assert await main.wait_until_answered(FakeCtx(p), "+911234567890", poll_interval=0) is True


async def test_automation_counts_as_answered():
    """DTMF navigation means the line is up; the agent should proceed."""
    p = FakeParticipant(["dialing", "automation"])
    assert await main.wait_until_answered(FakeCtx(p), "+911234567890", poll_interval=0) is True


async def test_hangup_before_answer_returns_false():
    p = FakeParticipant(["dialing", "hangup"])
    assert await main.wait_until_answered(FakeCtx(p), "+911234567890", poll_interval=0) is False


async def test_ringing_forever_times_out():
    """Never greet a line that rings out; the job should end instead."""
    p = FakeParticipant(["dialing"])
    assert await main.wait_until_answered(FakeCtx(p), "+911234567890", timeout=0.05) is False


async def test_participant_never_joins_times_out():
    ctx = FakeCtx(None, never_joins=True)
    assert await main.wait_until_answered(ctx, "+911234567890", timeout=0.05) is False


async def test_missing_attribute_is_not_treated_as_answered():
    """An absent sip.callStatus means unknown, which must not count as picked up."""
    p = FakeParticipant([None])
    assert await main.wait_until_answered(FakeCtx(p), "+911234567890", timeout=0.05) is False



class FakeTrackPub:
    def __init__(self, kind):
        self.kind = kind


class SilentParticipant:
    """No sip.callStatus at all, which some deployments have been reported to produce."""

    def __init__(self, with_audio: bool):
        from livekit import rtc

        self.attributes: dict[str, str] = {}
        self.track_publications = (
            {"a": FakeTrackPub(rtc.TrackKind.KIND_AUDIO)} if with_audio else {}
        )


async def test_missing_status_falls_back_to_published_audio(monkeypatch):
    """If the attribute never arrives, audio flowing means the call is up."""
    monkeypatch.setattr(main, "_has_audio", lambda p: True)
    p = SilentParticipant(with_audio=True)
    ok = await main.wait_until_answered(
        FakeCtx(p), "+911234567890", timeout=0.4, poll_interval=0
    )
    assert ok is True


async def test_missing_status_and_no_audio_still_times_out():
    """Silence plus no media is a line that never came up; do not greet it."""
    p = SilentParticipant(with_audio=False)
    ok = await main.wait_until_answered(
        FakeCtx(p), "+911234567890", timeout=0.2, poll_interval=0
    )
    assert ok is False
