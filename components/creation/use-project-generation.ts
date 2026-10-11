"use client";
import { useEffect, useRef, useState } from "react";
import {
  createGenerationAction,
  latestGenerationAction,
} from "@/app/actions/generation";
import type { GenerationInputs, GenerationJob } from "@/lib/generation/types";
import { quoteGenerationAction } from "@/app/actions/pricing";
import type { GenerationQuote } from "@/lib/pricing/types";

export function useProjectGeneration(
  projectId: string | null,
  initialJob: GenerationJob | null,
  initialError: string,
  inputs: GenerationInputs,
) {
  const [job, setJob] = useState(initialJob);
  const [error, setError] = useState("");
  const [statusError, setStatusError] = useState(initialError);
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [quoted, setQuoted] = useState<{
    key: string;
    requestId: string;
    inputs: GenerationInputs;
    value: GenerationQuote;
  } | null>(null);
  const inputKey = JSON.stringify({ projectId, inputs });
  const quote = quoted?.key === inputKey ? quoted.value : null;
  const inFlight = useRef(false);
  const epoch = useRef(0);
  const attempt = useRef<{
    projectId: string;
    requestId: string;
    inputs: GenerationInputs;
    quoteId: string;
  } | null>(null);
  const [retrying, setRetrying] = useState(false);

  function remember(next: GenerationJob | null) {
    if (next && next.requestId === attempt.current?.requestId) {
      attempt.current = null;
      setRetrying(false);
      setQuoted(null);
      setError("");
    }
    setJob((current) => {
      if (!next) return current;
      if (!current) return next;
      if (next.id === current.id)
        return next.updatedAt >= current.updatedAt ? next : current;
      return next.createdAt > current.createdAt ||
        (next.createdAt === current.createdAt && next.id > current.id)
        ? next
        : current;
    });
  }

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    const revisionRef = epoch;
    const reload = () => {
      if (document.visibilityState === "hidden") return;
      const revision = epoch.current;
      latestGenerationAction(projectId)
        .then((result) => {
          if (!active || revision !== epoch.current) return;
          if (result.ok) {
            remember(result.value);
            setStatusError("");
          } else setStatusError(result.message);
          if (!inFlight.current) {
            setCreating(false);
            setRefreshing(false);
            setQuoting(false);
            setRetrying(!!attempt.current);
            if (attempt.current)
              setError(
                "An earlier request is unconfirmed. Retry keeps its original submitted inputs.",
              );
          }
        })
        .catch(() => {
          if (active && revision === epoch.current) {
            setStatusError(
              "Generation status couldn’t be refreshed. Check status before submitting.",
            );
            if (!inFlight.current) {
              setCreating(false);
              setRefreshing(false);
              setQuoting(false);
            }
          }
        });
    };
    reload();
    window.addEventListener("pageshow", reload);
    document.addEventListener("visibilitychange", reload);
    return () => {
      active = false;
      revisionRef.current++;
      inFlight.current = false;
      window.removeEventListener("pageshow", reload);
      document.removeEventListener("visibilitychange", reload);
    };
  }, [projectId]);

  async function refresh() {
    if (!projectId || inFlight.current) return;
    setRefreshing(true);
    const revision = epoch.current;
    try {
      const result = await latestGenerationAction(projectId);
      window.dispatchEvent(new Event("sceenyk:allowance"));
      if (revision !== epoch.current) return;
      if (result.ok) {
        remember(result.value);
        setStatusError("");
      } else setStatusError(result.message);
    } catch {
      if (revision === epoch.current)
        setStatusError(
          "Generation status couldn’t be refreshed. Please try again.",
        );
    } finally {
      setRefreshing(false);
    }
  }

  async function generate() {
    if (
      !projectId ||
      inFlight.current ||
      statusError ||
      job?.status === "queued" ||
      job?.status === "processing"
    )
      return;
    if (!attempt.current && (!quote || quote.status !== "ready" || !quoted)) return;
    inFlight.current = true;
    const revision = ++epoch.current;
    setCreating(true);
    setError("");
    // Retain both UUID and submitted inputs after uncertain/lost responses.
    if (!attempt.current && quoted && quote) attempt.current = {
      projectId,
      requestId: quoted.requestId,
      inputs: structuredClone(quoted.inputs),
      quoteId: quote.id,
    };
    const submitted = attempt.current;
    if (!submitted) return;
    try {
      const result = await createGenerationAction({ quoteId: submitted.quoteId });
      window.dispatchEvent(new Event("sceenyk:allowance"));
      if (result.ok && attempt.current?.requestId === submitted.requestId)
        attempt.current = null;
      if (revision !== epoch.current) return;
      if (!result.ok) {
        setError(result.message);
        if (result.code !== "UNAVAILABLE") {
          attempt.current = null;
          setRetrying(false);
          setQuoted(null);
        } else setRetrying(true);
        return;
      }
      remember(result.value);
      setStatusError("");
      attempt.current = null;
      setQuoted(null);
      setRetrying(false);
      if (location.pathname === "/create")
        window.history.replaceState(null, "", `/projects/${projectId}`);
    } catch {
      if (revision === epoch.current) {
        setError(
          "Your request couldn’t be confirmed. Check status or retry the same request.",
        );
        setRetrying(true);
      }
    } finally {
      if (revision === epoch.current) {
        inFlight.current = false;
        setCreating(false);
      }
    }
  }
  async function reviewCost() {
    if (!projectId || inFlight.current || attempt.current) return;
    inFlight.current = true;
    const revision = ++epoch.current;
    setQuoting(true);
    setError("");
    setQuoted(null);
    const requestId = crypto.randomUUID();
    const submittedInputs = structuredClone(inputs);
    try {
      const result = await quoteGenerationAction({ projectId, requestId, inputs: submittedInputs });
      if (revision !== epoch.current) return;
      if (result.ok) setQuoted({
        key: inputKey, requestId,
        inputs: submittedInputs, value: result.value,
      });
      else setError(result.message);
    } catch {
      if (revision === epoch.current)
        setError("Generation cost couldn’t be checked. Please try again.");
    } finally {
      if (revision === epoch.current) {
        inFlight.current = false;
        setQuoting(false);
      }
    }
  }
  // A cached route can reactivate after an in-flight action completed while hidden.
  // Its owned reload recovers the database result; React state is never authority.
  return {
    job,
    error,
    statusError,
    creating,
    refreshing,
    quoting,
    quote,
    reviewCost,
    retrying,
    generate,
    refresh,
  };
}
