"use client";

import { useEffect, useRef } from "react";

type Props = {
  refreshMs: number;
  /** When omitted, falls back to a full page reload (standalone panel pages). */
  onRefresh?: () => void;
};

export default function AutoRefresh({ refreshMs, onRefresh }: Props) {
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    const id = setTimeout(() => {
      if (onRefreshRef.current) {
        onRefreshRef.current();
      } else {
        window.location.reload();
      }
    }, refreshMs);

    return () => clearTimeout(id);
  }, [refreshMs]);

  return null;
}
