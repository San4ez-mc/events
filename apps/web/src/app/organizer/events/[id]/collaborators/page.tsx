"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import type { Collaborator } from "@/lib/event-types";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

const ALL_PERMISSIONS = [
  "EDIT_EVENT",
  "MANAGE_REGISTRATIONS",
  "MANAGE_PAYMENTS",
  "SEND_NOTIFICATIONS",
  "MANAGE_CHAT",
  "INVITE_PREVIOUS_PARTICIPANTS",
  "VIEW_ANALYTICS",
] as const;

/** §30 — owner-only co-organizer management (add/update/remove, granular permissions). */
export default function CollaboratorsPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useTranslations();
  const router = useRouter();

  const [items, setItems] = useState<Collaborator[] | null>(null);
  const [error, setError] = useState(false);
  const [newUserId, setNewUserId] = useState("");
  const [newPermissions, setNewPermissions] = useState<string[]>([]);
  const [addError, setAddError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    const res = await fetch(`/api/v1/events/${id}/collaborators`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setError(true);
      return;
    }
    setItems((await res.json()) as Collaborator[]);
  }, [id]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace(`/login?next=/organizer/events/${id}/collaborators`);
      return;
    }
    queueMicrotask(() => void load());
  }, [authLoading, user, id, router, load]);

  function togglePermission(list: string[], permission: string, set: (next: string[]) => void) {
    set(list.includes(permission) ? list.filter((p) => p !== permission) : [...list, permission]);
  }

  async function addCollaborator() {
    const token = getAccessToken();
    if (!token || !newUserId.trim() || newPermissions.length === 0) return;
    setAddError(null);
    const res = await fetch(`/api/v1/events/${id}/collaborators`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId: newUserId.trim(), permissions: newPermissions }),
    });
    if (!res.ok) {
      setAddError(t("common.somethingWentWrong"));
      return;
    }
    const created = (await res.json()) as Collaborator;
    setItems((prev) => {
      const withoutDuplicate = (prev ?? []).filter((c) => c.id !== created.id);
      return [...withoutDuplicate, created];
    });
    setNewUserId("");
    setNewPermissions([]);
  }

  async function updatePermissions(collaboratorId: string, permissions: string[]) {
    const token = getAccessToken();
    if (!token) return;
    setBusyId(collaboratorId);
    try {
      const res = await fetch(`/api/v1/events/${id}/collaborators/${collaboratorId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ permissions }),
      });
      if (res.ok) {
        const updated = (await res.json()) as Collaborator;
        setItems((prev) => (prev ? prev.map((c) => (c.id === collaboratorId ? updated : c)) : prev));
      }
    } finally {
      setBusyId(null);
    }
  }

  async function remove(collaboratorId: string) {
    const token = getAccessToken();
    if (!token) return;
    setBusyId(collaboratorId);
    try {
      const res = await fetch(`/api/v1/events/${id}/collaborators/${collaboratorId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setItems((prev) => (prev ? prev.filter((c) => c.id !== collaboratorId) : prev));
      }
    } finally {
      setBusyId(null);
    }
  }

  if (authLoading || (!user && !error)) return null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold">{t("organizerCollaborators.title")}</h1>

      {error && <p className="text-danger">{t("common.somethingWentWrong")}</p>}
      {!error && items === null && <p className="text-muted">{t("common.loading")}</p>}

      {!error && items !== null && (
        <>
          {items.length === 0 && <p className="mb-6 text-muted">{t("organizerCollaborators.empty")}</p>}

          {items.length > 0 && (
            <ul className="mb-8 flex flex-col gap-3">
              {items.map((collaborator) => (
                <li key={collaborator.id} className="rounded-lg border border-border p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="font-medium">
                      {collaborator.user.name ?? collaborator.user.nickname ?? collaborator.user.email}
                    </p>
                    <Button
                      variant="secondary"
                      loading={busyId === collaborator.id}
                      onClick={() => void remove(collaborator.id)}
                    >
                      {t("organizerCollaborators.remove")}
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ALL_PERMISSIONS.map((permission) => {
                      const checked = collaborator.permissions.includes(permission);
                      return (
                        <label
                          key={permission}
                          className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={busyId === collaborator.id}
                            onChange={() => {
                              const next = checked
                                ? collaborator.permissions.filter((p) => p !== permission)
                                : [...collaborator.permissions, permission];
                              if (next.length > 0) void updatePermissions(collaborator.id, next);
                            }}
                          />
                          {t(`organizerCollaborators.permission.${permission}`)}
                        </label>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="rounded-lg border border-dashed border-border p-4">
            <h2 className="mb-3 font-semibold">{t("organizerCollaborators.addTitle")}</h2>
            <div className="mb-3">
              <TextField
                label={t("organizerCollaborators.userId")}
                value={newUserId}
                onChange={setNewUserId}
                placeholder={t("organizerCollaborators.userIdPlaceholder")}
              />
            </div>
            <p className="mb-1.5 text-sm font-medium">{t("organizerCollaborators.permissions")}</p>
            <div className="mb-4 flex flex-wrap gap-2">
              {ALL_PERMISSIONS.map((permission) => (
                <label
                  key={permission}
                  className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={newPermissions.includes(permission)}
                    onChange={() => togglePermission(newPermissions, permission, setNewPermissions)}
                  />
                  {t(`organizerCollaborators.permission.${permission}`)}
                </label>
              ))}
            </div>
            {addError && <p className="mb-3 text-sm text-danger">{addError}</p>}
            <Button disabled={!newUserId.trim() || newPermissions.length === 0} onClick={() => void addCollaborator()}>
              {t("organizerCollaborators.add")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
