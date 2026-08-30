"use client";

import { useState } from "react";
import type { Invite } from "@/lib/types";
import {
  InvitesStrip,
  FeedPostCard,
  ProfileStrengthCard,
  VisibilitySummaryCard,
} from "@/components/home/HomeSections";
import { PostComposer } from "@/components/home/PostComposer";

interface FeedItem {
  id: string;
  authorName: string;
  authorRole: string;
  timeAgo: string;
  body: string;
}

export function HomeFeed({
  invites,
  initialFeed,
  currentUserInitials,
}: {
  invites: Invite[];
  initialFeed: FeedItem[];
  currentUserInitials: string;
}) {
  const [feed, setFeed] = useState(initialFeed);

  function handleNewPost(body: string) {
    // Replace with a Supabase insert; optimistic-prepend here for now.
    setFeed((prev) => [
      { id: `local_${Date.now()}`, authorName: "You", authorRole: "You", timeAgo: "now", body },
      ...prev,
    ]);
  }

  return (
    <div className="mx-auto max-w-[820px] px-4 pb-24 pt-5 sm:px-6 sm:pt-8">
      <div className="sm:grid sm:grid-cols-[1fr_260px] sm:gap-5 sm:items-start">
        <div>
          <InvitesStrip invites={invites} />

          <PostComposer authorInitials={currentUserInitials} onSubmit={handleNewPost} />

          {feed.map((post) => (
            <FeedPostCard
              key={post.id}
              authorName={post.authorName}
              authorRole={post.authorRole}
              timeAgo={post.timeAgo}
              body={post.body}
            />
          ))}
        </div>

        <div className="mt-4 sm:mt-0">
          <ProfileStrengthCard percent={64} />
          <VisibilitySummaryCard findable nameHidden />
        </div>
      </div>
    </div>
  );
}
