"""Wire Twilio to LiveKit SIP, in both directions.

    python scripts/setup_sip.py          # create or verify everything
    python scripts/setup_sip.py --show   # print current state, change nothing

Idempotent: run it as often as you like. Trunk configuration lives here rather than in
console clicks so it can be reviewed, re-run after a credential rotation, and rebuilt
from scratch without anyone remembering which checkbox mattered.

What it sets up:

  inbound   PSTN -> Twilio -> (origination URI) -> LiveKit SIP -> a room -> the agent
  outbound  agent -> LiveKit SIP -> (termination URI) -> Twilio -> PSTN

The agent needs no changes for either: LiveKit puts the caller in a room as an ordinary
participant, and the worker already joins every room in the project.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv
from livekit import api

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

TWILIO_API = "https://api.twilio.com/2010-04-01"
TRUNKING_API = "https://trunking.twilio.com/v1"
INBOUND_TRUNK_NAME = "sonar-inbound"
OUTBOUND_TRUNK_NAME = "sonar-outbound"
ROOM_PREFIX = "sonar-call-"


def env(key: str) -> str:
    return (os.getenv(key) or "").strip()


def livekit_sip_host() -> str:
    """LiveKit Cloud serves SIP for a project at <project>.sip.livekit.cloud."""
    host = env("LIVEKIT_URL").removeprefix("wss://").removeprefix("ws://").rstrip("/")
    project = host.split(".")[0]
    return f"{project}.sip.livekit.cloud"


def phone_number() -> str:
    return env("TWILIO_PHONE_NUMBER").replace(" ", "")


def missing_config() -> list[str]:
    needed = [
        "LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET",
        "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER",
        "TWILIO_SIP_TERMINATION_URI", "TWILIO_SIP_USERNAME", "TWILIO_SIP_PASSWORD",
    ]
    return [k for k in needed if not env(k)]


# ── LiveKit side ────────────────────────────────────────────────────────────


async def ensure_inbound_trunk(lk: api.LiveKitAPI) -> str:
    existing = await lk.sip.list_inbound_trunk(api.ListSIPInboundTrunkRequest())
    for t in existing.items:
        if t.name == INBOUND_TRUNK_NAME:
            print(f"  inbound trunk exists: {t.sip_trunk_id} for {list(t.numbers)}")
            return t.sip_trunk_id

    trunk = await lk.sip.create_inbound_trunk(
        api.CreateSIPInboundTrunkRequest(
            trunk=api.SIPInboundTrunkInfo(
                name=INBOUND_TRUNK_NAME,
                numbers=[phone_number()],
                # Twilio authenticates by source IP on its own trunk, so no credentials
                # are set here. Add allowed_addresses to lock this down further.
                krisp_enabled=False,
            )
        )
    )
    print(f"  inbound trunk created: {trunk.sip_trunk_id}")
    return trunk.sip_trunk_id


async def ensure_outbound_trunk(lk: api.LiveKitAPI) -> str:
    existing = await lk.sip.list_outbound_trunk(api.ListSIPOutboundTrunkRequest())
    for t in existing.items:
        if t.name == OUTBOUND_TRUNK_NAME:
            print(f"  outbound trunk exists: {t.sip_trunk_id} -> {t.address}")
            return t.sip_trunk_id

    trunk = await lk.sip.create_outbound_trunk(
        api.CreateSIPOutboundTrunkRequest(
            trunk=api.SIPOutboundTrunkInfo(
                name=OUTBOUND_TRUNK_NAME,
                address=env("TWILIO_SIP_TERMINATION_URI"),
                numbers=[phone_number()],
                auth_username=env("TWILIO_SIP_USERNAME"),
                auth_password=env("TWILIO_SIP_PASSWORD"),
            )
        )
    )
    print(f"  outbound trunk created: {trunk.sip_trunk_id}")
    return trunk.sip_trunk_id


async def ensure_dispatch_rule(lk: api.LiveKitAPI, inbound_trunk_id: str) -> str:
    existing = await lk.sip.list_dispatch_rule(api.ListSIPDispatchRuleRequest())
    for r in existing.items:
        if r.name == INBOUND_TRUNK_NAME:
            print(f"  dispatch rule exists: {r.sip_dispatch_rule_id}")
            return r.sip_dispatch_rule_id

    # One room per caller. A shared room would put two strangers on the same call.
    rule = await lk.sip.create_dispatch_rule(
        api.CreateSIPDispatchRuleRequest(
            name=INBOUND_TRUNK_NAME,
            trunk_ids=[inbound_trunk_id],
            rule=api.SIPDispatchRule(
                dispatch_rule_individual=api.SIPDispatchRuleIndividual(
                    room_prefix=ROOM_PREFIX
                )
            ),
        )
    )
    print(f"  dispatch rule created: {rule.sip_dispatch_rule_id} ({ROOM_PREFIX}*)")
    return rule.sip_dispatch_rule_id


# ── Twilio side ─────────────────────────────────────────────────────────────


async def ensure_twilio(client: httpx.AsyncClient) -> None:
    sid, token = env("TWILIO_ACCOUNT_SID"), env("TWILIO_AUTH_TOKEN")
    auth = (sid, token)
    domain = env("TWILIO_SIP_TERMINATION_URI")

    trunks = (await client.get(f"{TRUNKING_API}/Trunks", auth=auth)).json().get("trunks", [])
    trunk = next((t for t in trunks if t.get("domain_name") == domain), None)
    if not trunk:
        print(f"  no Twilio trunk with domain {domain}")
        print("    create one in the console (Elastic SIP Trunking > Trunks) and set")
        print("    TWILIO_SIP_TERMINATION_URI to its termination domain")
        return
    trunk_sid = trunk["sid"]
    print(f"  twilio trunk: {trunk_sid} ({domain})")

    # Origination: where Twilio sends calls that arrive on this number.
    target = f"sip:{livekit_sip_host()};transport=tcp"
    urls = (
        await client.get(f"{TRUNKING_API}/Trunks/{trunk_sid}/OriginationUrls", auth=auth)
    ).json().get("origination_urls", [])
    if any(u.get("sip_url") == target for u in urls):
        print(f"  origination URI already points at {target}")
    else:
        r = await client.post(
            f"{TRUNKING_API}/Trunks/{trunk_sid}/OriginationUrls",
            auth=auth,
            data={
                "FriendlyName": "LiveKit SIP",
                "SipUrl": target,
                "Priority": 1,
                "Weight": 1,
                "Enabled": "true",
            },
        )
        if r.status_code >= 300:
            print(f"  FAILED to add origination URI: HTTP {r.status_code} {r.text[:160]}")
        else:
            print(f"  origination URI added: {target}")

    # The number has to be attached to the trunk, or inbound calls never reach it.
    attached = (
        await client.get(f"{TRUNKING_API}/Trunks/{trunk_sid}/PhoneNumbers", auth=auth)
    ).json().get("phone_numbers", [])
    if any(p.get("phone_number") == phone_number() for p in attached):
        print(f"  {phone_number()} already attached to the trunk")
        return

    owned = (
        await client.get(f"{TWILIO_API}/Accounts/{sid}/IncomingPhoneNumbers.json", auth=auth)
    ).json().get("incoming_phone_numbers", [])
    match = next((p for p in owned if p["phone_number"] == phone_number()), None)
    if not match:
        print(f"  {phone_number()} is not owned by this account; cannot attach")
        return

    r = await client.post(
        f"{TRUNKING_API}/Trunks/{trunk_sid}/PhoneNumbers",
        auth=auth,
        data={"PhoneNumberSid": match["sid"]},
    )
    if r.status_code >= 300:
        print(f"  FAILED to attach number: HTTP {r.status_code} {r.text[:160]}")
    else:
        print(f"  {phone_number()} attached to the trunk")


async def show(lk: api.LiveKitAPI) -> None:
    inb = await lk.sip.list_inbound_trunk(api.ListSIPInboundTrunkRequest())
    out = await lk.sip.list_outbound_trunk(api.ListSIPOutboundTrunkRequest())
    rules = await lk.sip.list_dispatch_rule(api.ListSIPDispatchRuleRequest())
    print(f"\nLiveKit SIP host: {livekit_sip_host()}")
    print(f"\ninbound trunks ({len(inb.items)}):")
    for t in inb.items:
        print(f"  {t.sip_trunk_id}  {t.name}  numbers={list(t.numbers)}")
    print(f"\noutbound trunks ({len(out.items)}):")
    for t in out.items:
        print(f"  {t.sip_trunk_id}  {t.name}  -> {t.address}  numbers={list(t.numbers)}")
    print(f"\ndispatch rules ({len(rules.items)}):")
    for r in rules.items:
        print(f"  {r.sip_dispatch_rule_id}  {r.name}  trunks={list(r.trunk_ids)}")


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--show", action="store_true", help="print current state, change nothing")
    args = ap.parse_args()

    absent = missing_config()
    if absent:
        print(f"Missing from .env: {', '.join(absent)}")
        return 1

    lk = api.LiveKitAPI(
        url=env("LIVEKIT_URL"),
        api_key=env("LIVEKIT_API_KEY"),
        api_secret=env("LIVEKIT_API_SECRET"),
    )
    try:
        if args.show:
            await show(lk)
            return 0

        print("\nLiveKit:")
        inbound_id = await ensure_inbound_trunk(lk)
        await ensure_outbound_trunk(lk)
        await ensure_dispatch_rule(lk, inbound_id)

        print("\nTwilio:")
        async with httpx.AsyncClient(timeout=45) as client:
            await ensure_twilio(client)

        print(f"\nDone. Call {phone_number()} and the agent answers.")
        print("A Twilio trial account only accepts inbound calls from numbers verified")
        print("in the console, and only dials out to verified numbers.")
        return 0
    finally:
        await lk.aclose()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
