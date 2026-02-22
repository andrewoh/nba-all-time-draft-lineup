'use client';

import { useState } from 'react';

type CopyLinkButtonProps = {
  url: string;
};

function normalizeCopyUrl(rawUrl: string): string {
  if (typeof window === 'undefined') {
    return rawUrl;
  }

  try {
    if (rawUrl.startsWith('/')) {
      return `${window.location.origin}${rawUrl}`;
    }

    const parsed = new URL(rawUrl, window.location.origin);
    const isLocalHost =
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname.endsWith('.local');

    if (isLocalHost && parsed.hostname !== window.location.hostname) {
      return `${window.location.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }

    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

export function CopyLinkButton({ url }: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(normalizeCopyUrl(url));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button type="button" onClick={onCopy} className="button-secondary">
      {copied ? 'Copied!' : 'Copy share link'}
    </button>
  );
}
