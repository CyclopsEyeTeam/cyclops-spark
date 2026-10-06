"""Cyclops Link V1 conformance for Spark's own implementation (plugins/cyclops-spark/link/spark_link.py),
the helper her Claude Code module starts while her Link is on.

Driven by the vendored, language-neutral fixtures in tests/fixtures/cyclops-link-v1/
(copied verbatim from Cyclops Link commit 3ba5cab). Nothing here imports another presence.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "plugins" / "cyclops-spark" / "link"))
sys.dont_write_bytecode = True
import spark_link as link  # noqa: E402
import io  # noqa: E402
import signal  # noqa: E402

FIX = Path(__file__).resolve().parent / "fixtures" / "cyclops-link-v1"
OTHER_UID = 4242


def load(name):
    return json.loads((FIX / name).read_text(encoding="utf-8"))


def make(path: Path, fs: dict, content: bytes) -> bool:
    kind = fs.get("type", "file")
    if kind == "absent":
        return True
    if kind == "dir":
        path.mkdir()
    elif kind == "symlink":
        target = path.parent.parent / ("target-" + path.name)
        target.write_bytes(content)
        os.chmod(target, 0o600)
        path.symlink_to(target)
        return True
    else:
        path.write_bytes(content)
    os.chmod(path, int(fs.get("mode", "0600"), 8))
    if fs.get("owner") == "other":
        if os.getuid() != 0:
            return False
        os.chown(path, OTHER_UID, OTHER_UID)
    return True


class Derivation(unittest.TestCase):
    def setUp(self):
        self.d = load("derivation.json")
        self.salt = bytes.fromhex(self.d["salt_hex"])

    def test_rooms(self):
        for c in self.d["room"]:
            self.assertEqual(link.derive(self.salt, "room", os.fsencode(c["project_identity"])), c["expect"])

    def test_instances(self):
        for c in self.d["instance"]:
            ident = c["host"].encode() + b"\n" + c["session_id"].encode()
            self.assertEqual(link.derive(self.salt, "instance", ident), c["expect"])

    def test_spark_instance_helper_uses_claude_code_host(self):
        for c in self.d["instance"]:
            if c["host"] == "claude-code":
                self.assertEqual(link.instance_for(self.salt, c["session_id"]), c["expect"])

    def test_salt_validity(self):
        with tempfile.TemporaryDirectory() as t:
            for c in self.d["salt_validity"]:
                box = Path(t) / c["name"]
                box.mkdir(mode=0o700)
                if not make(box / ".salt", c["fs"], c["content"].encode()):
                    continue
                self.assertEqual(link.salt_is_valid(box / ".salt"), c["expect"] == "valid", c["name"])

    def test_directory_validity(self):
        with tempfile.TemporaryDirectory() as t:
            for c in self.d["directory_validity"]:
                holder = Path(t) / ("d-" + c["name"])
                holder.mkdir(mode=0o700)
                p = holder / "cyclops-link"
                if c["fs"]["type"] == "symlink":
                    real = holder / "real"
                    real.mkdir(mode=0o700)
                    p.symlink_to(real)
                elif not make(p, c["fs"], b""):
                    continue
                if c["expect"] == "create-0700-then-use":
                    self.assertEqual(link.prepare_dir(p, create=True), p)
                    self.assertEqual(os.lstat(p).st_mode & 0o777, 0o700)
                else:
                    before = os.lstat(p).st_mode
                    got = link.prepare_dir(p, create=True)
                    self.assertEqual(got is not None, c["expect"] == "use", c["name"])
                    self.assertEqual(os.lstat(p).st_mode, before, "an existing directory is never repaired")

    def test_new_salt_is_random_0600_and_never_published(self):
        with tempfile.TemporaryDirectory() as t:
            d = Path(t) / "link"
            d.mkdir(mode=0o700)
            salt = link.load_salt(d, create=True)
            self.assertEqual(len(salt), 32)
            self.assertEqual(os.lstat(d / ".salt").st_mode & 0o777, 0o600)
            self.assertEqual(link.load_salt(d, create=True), salt, "an existing salt is reused")


class Records(unittest.TestCase):
    def test_every_case(self):
        rc = load("records.json")
        with tempfile.TemporaryDirectory() as t:
            for c in rc["cases"]:
                ld = Path(t) / c["name"]
                ld.mkdir(parents=True, mode=0o700)
                if "record" in c:
                    content = json.dumps(c["record"]).encode()
                elif "raw_hex" in c:
                    content = bytes.fromhex(c["raw_hex"])
                else:
                    content = (c.get("raw") or "").encode()
                p = ld / c["filename"]
                if not make(p, c["fs"], content):
                    continue
                self.assertEqual(link.read_record(p) is not None, c["expect"] == "valid", c["name"])

    def test_ignored_names(self):
        rc = load("records.json")
        good = {"v": 1, "presence": "keeper", "host": "codex", "instance": rc["fixture_instances"]["keeper-1"],
                "room": rc["fixture_room"], "state": "idle", "tools": 0, "branches": 0, "reaching": [],
                "updated_at": 1000.0, "ended": False}
        with tempfile.TemporaryDirectory() as t:
            for name in rc["ignored_names"]:
                p = Path(t) / name
                p.write_text(json.dumps(good))
                os.chmod(p, 0o600)
                self.assertIsNone(link.read_record(p), name)


class Views(unittest.TestCase):
    def test_every_scenario(self):
        vs = load("views.json")
        for a in link.PRESENCES:
            for b in link.PRESENCES:
                if a != b:
                    self.assertEqual(link.bearing(a, b), vs["bearings"][f"{a}->{b}"])
        with tempfile.TemporaryDirectory() as t:
            for s in vs["scenarios"]:
                ld = Path(t) / s["name"]
                ld.mkdir(mode=0o700)
                for f in s["files"]:
                    p = ld / f["filename"]
                    p.write_text(json.dumps(f["record"]))
                    os.chmod(p, 0o600)
                records = [r for r in (link.read_record(p) for p in sorted(ld.iterdir())) if r]
                self.assertEqual(link.compose(s["self"], records, s["now"], s["policy"]), s["expect"], s["name"])

    def test_reader_paces_and_follows_atomic_updates(self):
        with tempfile.TemporaryDirectory() as t:
            env = {"CYCLOPS_LINK_DIR": str(Path(t) / "link"), "HOME": t}
            w = link.Writer("0123456789abcdef", "fedcba9876543210", env)
            self.assertTrue(w.publish("working", now=1000.0))
            r = link.Reader(env)
            self.assertEqual([x["state"] for x in r.poll(now=10.0)], ["working"])
            w.publish("stopped", now=1001.0)
            self.assertEqual([x["state"] for x in r.poll(now=10.5)], ["working"], "at most one poll a second")
            self.assertEqual([x["state"] for x in r.poll(now=11.1)], ["stopped"])
            self.assertEqual([n for n in os.listdir(Path(t) / "link") if n.endswith(".tmp")], [])



class Helper(unittest.TestCase):
    def env(self, t, **kw):
        e = {"HOME": t, "XDG_STATE_HOME": t + "/state", "CYCLOPS_LINK_DIR": t + "/link",
             "SPARK_LINK_SESSION": "session-secret-7f3a", "SPARK_LINK_FOLDER": t}
        e.update(kw)
        return e

    def run_helper(self, env, steps, **kw):
        """Drive the helper's loop with a fake clock; steps[i](facts_path) runs before round i."""
        out = io.StringIO()
        clock = [1000.0]
        rounds = [0]
        facts = {}

        def sleep(dt):
            clock[0] += dt
            rounds[0] += 1

        def alive():
            if rounds[0] < len(steps) and steps[rounds[0]]:
                path = facts.get("path")
                if path is None:
                    first = json.loads(out.getvalue().splitlines()[0])
                    facts["path"] = path = first["ready"]["facts"]
                steps[rounds[0]](path)
            return rounds[0] < len(steps)
        lingered = []
        result = link.run(env, out, clock=lambda: clock[0], sleep=sleep, parent_alive=alive,
                          linger=lambda w: lingered.append(w), **kw)
        return result, [json.loads(l) for l in out.getvalue().splitlines()], lingered

    def records(self, t):
        return [json.loads(p.read_text()) for p in sorted(Path(t, "link").glob("spark-*.json"))]

    def test_publishes_only_coarse_facts_heartbeats_and_ends_truthfully(self):
        with tempfile.TemporaryDirectory() as t:
            write = lambda doc: (lambda path: Path(path).write_text(json.dumps(doc)))
            steps = [write({"state": "thinking", "tools": 0, "branches": 0, "reaching": [],
                            "prompt": "deploy with key sk-live-4f9a and password hunter2"}), None, None,
                     write({"state": "tool", "tools": 1, "branches": 0, "reaching": ["keeper", "keeper", "spark", "bogus"],
                            "command": "codex exec rotate AKIAIOSFODNN7EXAMPLE"})] + [None] * 30
            result, lines, lingered = self.run_helper(self.env(t), steps)
            self.assertEqual(result, "ended")
            self.assertIn("ready", lines[0])
            recs = self.records(t)
            self.assertEqual(len(recs), 1)
            rec = recs[0]
            self.assertEqual((rec["state"], rec["ended"], rec["host"]), ("ended", True, "claude-code"))
            self.assertEqual(len(lingered), 1, "the ended record is kept for the grace period, then tidied")
            text = "".join(p.read_text() for p in Path(t, "link").iterdir() if p.is_file())
            for bad in ("hunter2", "sk-live", "AKIA", "codex exec", "session-secret", t):
                self.assertNotIn(bad, text)
            self.assertFalse(list(Path(t, "state", "cyclops-spark").glob("*.facts")), "the facts file goes with the helper")

    def test_view_lines_come_from_peer_records_only(self):
        with tempfile.TemporaryDirectory() as t:
            env = self.env(t)
            d = link.prepare_dir(Path(env["CYCLOPS_LINK_DIR"]), create=True)
            salt = link.load_salt(d, create=True)
            import time
            keeper = {"v": 1, "presence": "keeper", "host": "codex", "instance": "aaaaaaaaaaaaaaaa",
                      "room": link.room_for(salt, t), "state": "tool", "tools": 1, "branches": 0,
                      "reaching": ["spark"], "updated_at": time.time(), "ended": False}
            self.assertTrue(link.write_record(d, keeper))
            write = lambda path: Path(path).write_text(json.dumps({"state": "idle", "tools": 0, "branches": 0, "reaching": []}))
            out = io.StringIO()
            rounds = [0]
            link.run(env, out, sleep=lambda dt: rounds.__setitem__(0, rounds[0] + 1),
                     parent_alive=lambda: (rounds[0] != 1 or write(json.loads(out.getvalue().splitlines()[0])["ready"]["facts"]) or True) and rounds[0] < 4,
                     linger=lambda w: None)
            views = [json.loads(l)["view"] for l in out.getvalue().splitlines() if "view" in l]
            self.assertEqual(views[-1]["peers"][0]["presence"], "keeper")
            self.assertEqual(views[-1]["peers"][0]["bearing"], 0)
            self.assertEqual(views[-1]["threads"], [{"from": "keeper", "to": "spark"}])

    def test_unsafe_directory_or_missing_session_refuses_quietly(self):
        with tempfile.TemporaryDirectory() as t:
            Path(t, "link").mkdir()
            os.chmod(Path(t, "link"), 0o777)
            out = io.StringIO()
            self.assertEqual(link.run(self.env(t), out), "refused")
            self.assertEqual(os.listdir(Path(t, "link")), [])
            self.assertEqual(link.run(self.env(t, SPARK_LINK_SESSION=""), io.StringIO()), "refused")

    def test_nothing_published_until_spark_says_something_true(self):
        with tempfile.TemporaryDirectory() as t:
            result, lines, lingered = self.run_helper(self.env(t), [None] * 5)
            self.assertEqual((result, self.records(t), lingered), ("ended", [], []))

    def test_a_real_process_ends_on_sigterm_and_says_so(self):
        with tempfile.TemporaryDirectory() as t:
            env = dict(os.environ, **self.env(t))
            proc = subprocess.Popen([sys.executable, str(ROOT / "plugins/cyclops-spark/link/spark_link.py")],
                                    env=env, stdout=subprocess.PIPE, text=True)
            ready = json.loads(proc.stdout.readline())
            Path(ready["ready"]["facts"]).write_text('{"state":"working","tools":0,"branches":0,"reaching":[]}')
            import time
            for _ in range(40):
                if self.records(t):
                    break
                time.sleep(.05)
            self.assertEqual(self.records(t)[0]["state"], "working")
            proc.send_signal(signal.SIGTERM)
            proc.wait(timeout=5)
            proc.stdout.close()
            rec = self.records(t)[0]
            self.assertEqual((rec["state"], rec["ended"]), ("ended", True))


if __name__ == "__main__":
    unittest.main()
