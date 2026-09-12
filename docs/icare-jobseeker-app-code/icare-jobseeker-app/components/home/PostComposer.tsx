"use client";

import { useState } from "react";

interface PostComposerProps {
  authorInitials: string;
  onSubmit: (body: string) => void;
}

export function PostComposer({ authorInitials, onSubmit }: PostComposerProps) {
  const [expanded, setExpanded] = useState(false);
  const [body, setBody] = useState("");

  function handlePost() {
    const trimmed = body.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setBody("");
    setExpanded(false);
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="mb-3 flex w-full items-center gap-3 rounded-2xl border border-icare-line bg-white p-3.5 text-left"
      >
        <span className="h-8 w-8 flex-none rounded-full bg-icare-lavender" />
        <span className="text-[13.5px] text-icare-mute">Share an update…</span>
      </button>
    );
  }

  return (
    <div className="mb-3 rounded-2xl border border-icare-line bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => {
            setExpanded(false);
            setBody("");
          }}
          className="font-mono text-[11px] text-icare-mute"
        >
          Cancel
        </button>
        <p className="font-mono text-[10px] uppercase tracking-wide text-icare-mute">New post</p>
        <button
          onClick={handlePost}
          disabled={!body.trim()}
          className="font-mono text-[11px] font-semibold text-icare-purple disabled:opacity-40"
        >
          Post
        </button>
      </div>

      <div className="mb-2 flex items-center gap-2.5">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-icare-lavender font-display text-xs font-bold text-icare-purple">
          {authorInitials}
        </span>
        <p className="font-mono text-[10px] text-icare-mute">Posting to your network</p>
      </div>

      <textarea
        autoFocus
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What's on your mind?"
        rows={3}
        className="w-full resize-none border-0 p-0 text-[14px] text-icare-ink outline-none placeholder:text-icare-mute"
      />

      <button className="mt-2 font-mono text-[11px] text-icare-mute">+ Photo</button>
    </div>
  );
}
