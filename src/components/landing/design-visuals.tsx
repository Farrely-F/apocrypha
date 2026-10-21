"use client";

import { motion, useTransform, type MotionValue } from "motion/react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { clamp01 } from "./scramble";

/** Visuals for "The design". Each one is drawn from `t`, 0..1 through its step. */
type Props = { t: MotionValue<number> };

/** Fade a line in once `t` passes `at`. Stepped, like everything else in this world. */
function Line({ t, at, children, className }: Props & { at: number; children: React.ReactNode; className?: string }) {
  const opacity = useTransform(t, (v) => (v >= at ? 1 : 0.14));
  return (
    <motion.p style={{ opacity }} className={className}>
      {children}
    </motion.p>
  );
}

function Bar({ t, from, to }: Props & { from: number; to: number }) {
  const scaleX = useTransform(t, (v) => clamp01((v - from) / (to - from)));
  return (
    <div className="h-px w-full bg-hairline-faint">
      <motion.div style={{ scaleX }} className="h-px origin-left bg-signal" />
    </div>
  );
}

export function SignInVisual({ t }: Props) {
  return (
    <div className="grid gap-5 font-mono text-[0.8125rem] leading-6">
      <Line t={t} at={0} className="text-bone">
        <span className="text-signal">&gt;</span> sign in with github
      </Line>
      <div className="grid gap-1">
        <div className="flex justify-between text-xs text-bone-faint">
          <span>your browser</span>
          <span>our server</span>
        </div>
        <Bar t={t} from={0.1} to={0.5} />
      </div>
      <div className="grid gap-1">
        <Line t={t} at={0.5} className="text-bone-dim">
          server learns <span className="text-bone">who you are</span>
        </Line>
        <Line t={t} at={0.7} className="text-bone-dim">
          server learns <span className="text-bone-faint">nothing about what you hold</span>
        </Line>
        <Line t={t} at={0.9} className="text-bone-faint">
          vault: not made yet
        </Line>
      </div>
    </div>
  );
}

export function VaultVisual({ t }: Props) {
  const dots = useTransform(t, (v) => "•".repeat(Math.round(clamp01(v / 0.3) * 14)));
  return (
    <div className="grid gap-4 font-mono text-[0.8125rem] leading-6">
      <p className="text-bone">
        <span className="text-bone-dim">passphrase </span>
        <motion.span>{dots}</motion.span>
        <span aria-hidden className="mora-caret ml-1" />
      </p>
      <Bar t={t} from={0.3} to={0.55} />
      <Line t={t} at={0.35} className="text-bone-dim">
        argon2id <span className="text-bone">64 MiB, t=3</span>, in this browser
      </Line>
      <Line t={t} at={0.55} className="text-bone-dim">
        locks <span className="text-bone">your private key</span>
      </Line>
      <Line t={t} at={0.7} className="text-signal">
        server keeps: v1|a256gcm|Qm9Kc2xhYmVs…
      </Line>
      <Line t={t} at={0.88} className="text-bone-dim">
        recovery key <span className="text-bone">shown once</span>. Save it.
      </Line>
    </div>
  );
}

const MATRIX = [
  ["you", "write", "write", "write"],
  ["ana", "write", "read", "none"],
  ["ben", "read", "none", "none"],
] as const;

export function KeysVisual({ t }: Props) {
  return (
    <div className="grid gap-4 text-[0.8125rem]">
      <Table>
        <TableHeader>
          <TableRow className="border-hairline">
            <TableHead className="text-bone-faint">member</TableHead>
            {["dev", "staging", "prod"].map((e, i) => (
              <TableHead key={e} className="text-bone">
                <Cell t={t} at={0.1 + i * 0.15}>{e} key v1</Cell>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {MATRIX.map(([who, ...grants], r) => (
            <TableRow key={who} className="border-hairline-faint">
              <TableCell className="text-bone-dim">{who}</TableCell>
              {grants.map((g, c) => (
                <TableCell key={c}>
                  <Cell t={t} at={0.45 + r * 0.14} dim={g === "none"}>
                    {g}
                  </Cell>
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Line t={t} at={0.9} className="text-bone-dim">
        <span className="text-bone">read</span> means holding the key. The
        cryptography enforces it.
      </Line>
    </div>
  );
}

function Cell({ t, at, dim, children }: Props & { at: number; dim?: boolean; children: React.ReactNode }) {
  const opacity = useTransform(t, (v) => (v >= at ? 1 : 0.14));
  return (
    <motion.span style={{ opacity }} className={dim ? "text-bone-faint" : "text-signal"}>
      {children}
    </motion.span>
  );
}

export function InviteVisual({ t }: Props) {
  const fragment = "k3Wm9Qx7LpA2dRv8TnYe";
  const shown = useTransform(t, (v) => fragment.slice(0, Math.round(clamp01((v - 0.2) / 0.5) * fragment.length)));
  return (
    <div className="grid gap-5 font-mono text-[0.8125rem] leading-6">
      <p className="break-all text-bone">
        <span className="text-bone-dim">https://apocrypha.example/join/9f3a1c</span>
        <span className="text-signal">#</span>
        <motion.span className="text-signal">{shown}</motion.span>
      </p>
      <div className="grid grid-cols-[1fr_auto] gap-x-4 text-xs">
        <Line t={t} at={0.05} className="text-bone-dim">
          your browser sends <span className="text-bone">GET /join/9f3a1c</span>
        </Line>
        <Line t={t} at={0.05} className="text-bone-faint">
          server
        </Line>
        <Line t={t} at={0.75} className="text-bone-dim">
          after the <span className="text-signal">#</span> never leaves your browser
        </Line>
        <Line t={t} at={0.75} className="text-bone-faint">
          not sent
        </Line>
      </div>
      <Line t={t} at={0.9} className="text-bone-dim">
        That part holds the key. We never see it.
      </Line>
    </div>
  );
}
