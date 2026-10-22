import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  createStaffRole,
  deleteStaffRole,
  getStaffMembers,
  getStaffRoles,
  setStaffMemberRole,
  updateStaffRole,
  type StaffRole,
} from "@/lib/api/staff";
import { PERMISSION_MODULES } from "@/lib/permissions";
import { createStaffUserFn, deleteStaffUserFn, setStaffPasswordFn } from "@/lib/staff.functions";
import { dateShort } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/DataStates";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/team")({
  head: () => ({ meta: [{ title: "Admin Roles — HABÄNE Admin" }] }),
  component: AdminRolesPage,
});

const NEW_ROLE = "__new_role__";

type RoleDraft = { id: string | null; name: string; permissions: string[] };

function AdminRolesPage() {
  const qc = useQueryClient();
  const roles = useQuery({ queryKey: ["staff", "roles"], queryFn: getStaffRoles });
  const members = useQuery({ queryKey: ["staff", "members"], queryFn: getStaffMembers });

  const [roleDraft, setRoleDraft] = useState<RoleDraft | null>(null);
  const [afterRoleSaved, setAfterRoleSaved] = useState<((r: StaffRole) => void) | null>(null);
  const [userOpen, setUserOpen] = useState(false);
  const [user, setUser] = useState({ loginId: "", displayName: "", password: "", roleId: "" });
  const [resetFor, setResetFor] = useState<{ userId: string; loginId: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [removeFor, setRemoveFor] = useState<{ userId: string; loginId: string } | null>(null);
  const [roleToDelete, setRoleToDelete] = useState<StaffRole | null>(null);

  const createUser = useServerFn(createStaffUserFn);
  const setPassword = useServerFn(setStaffPasswordFn);
  const removeUser = useServerFn(deleteStaffUserFn);

  const refresh = () => qc.invalidateQueries({ queryKey: ["staff"] });

  const saveRole = useMutation({
    mutationFn: async (d: RoleDraft) => {
      if (!d.name.trim()) throw new Error("Give the role a name.");
      if (d.id) {
        await updateStaffRole(d.id, d.name, d.permissions);
        return null;
      }
      return createStaffRole(d.name, d.permissions);
    },
    onSuccess: (created) => {
      toast.success("Role saved");
      setRoleDraft(null);
      refresh();
      if (created && afterRoleSaved) afterRoleSaved(created);
      setAfterRoleSaved(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteRole = useMutation({
    mutationFn: (id: string) => deleteStaffRole(id),
    onSuccess: () => {
      toast.success("Role deleted");
      setRoleToDelete(null);
      refresh();
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setRoleToDelete(null);
    },
  });

  const addUser = useMutation({
    mutationFn: () => {
      if (!user.roleId) throw new Error("Choose a role for this person.");
      return createUser({ data: user });
    },
    onSuccess: () => {
      toast.success("User added — they can sign in with their User ID and password");
      setUserOpen(false);
      setUser({ loginId: "", displayName: "", password: "", roleId: "" });
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const changeRole = useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) =>
      setStaffMemberRole(userId, roleId),
    onSuccess: () => {
      toast.success("Role changed");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetPassword = useMutation({
    mutationFn: () => setPassword({ data: { userId: resetFor!.userId, password: newPassword } }),
    onSuccess: () => {
      toast.success("Password changed");
      setResetFor(null);
      setNewPassword("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteUser = useMutation({
    mutationFn: (userId: string) => removeUser({ data: { userId } }),
    onSuccess: () => {
      toast.success("User deleted");
      setRemoveFor(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (roles.error) return <ErrorState error={roles.error} onRetry={() => roles.refetch()} />;
  if (roles.isLoading || members.isLoading) return <LoadingState />;

  const roleList = roles.data ?? [];
  const memberList = members.data ?? [];
  const roleName = (id: string) => roleList.find((r) => r.id === id)?.name ?? "—";
  const moduleLabel = (key: string) => PERMISSION_MODULES.find((m) => m.key === key)?.label ?? key;

  function openNewRole(after?: (r: StaffRole) => void) {
    setAfterRoleSaved(after ? () => after : null);
    setRoleDraft({ id: null, name: "", permissions: [] });
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Admin Roles"
        description="Create a role, choose what it can open, then add people with a User ID and password. They sign in on the normal sign-in page and only see what their role allows."
        actions={
          <>
            <Button variant="outline" onClick={() => openNewRole()}>
              Add role
            </Button>
            <Button
              onClick={() => {
                if (roleList.length === 0) {
                  toast.info("Create a role first, then add people to it.");
                  openNewRole((r) => {
                    setUser((u) => ({ ...u, roleId: r.id }));
                    setUserOpen(true);
                  });
                  return;
                }
                setUserOpen(true);
              }}
            >
              Add user
            </Button>
          </>
        }
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Roles</h2>
        {roleList.length === 0 ? (
          <EmptyState
            title="No roles yet"
            description="A role is a name plus a list of dashboard sections, e.g. “Content editor” → Content and Visitor Insights."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {roleList.map((r) => {
              const count = memberList.filter((m) => m.role_id === r.id).length;
              return (
                <div key={r.id} className="space-y-3 rounded-lg border border-border bg-card p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {count} {count === 1 ? "person" : "people"}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setRoleDraft({ id: r.id, name: r.name, permissions: [...r.permissions] })
                        }
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setRoleToDelete(r)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {r.permissions.length === 0 ? (
                      <span className="text-xs text-muted-foreground">No access selected</span>
                    ) : (
                      r.permissions.map((p) => (
                        <span key={p} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                          {moduleLabel(p)}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">People</h2>
        {memberList.length === 0 ? (
          <EmptyState
            title="No staff users yet"
            description="Add a user to let someone sign in with limited access."
          />
        ) : (
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {memberList.map((m) => (
                  <TableRow key={m.user_id}>
                    <TableCell className="font-medium">{m.login_id}</TableCell>
                    <TableCell>{m.display_name || "—"}</TableCell>
                    <TableCell>
                      <Select
                        value={m.role_id}
                        onValueChange={(v) => changeRole.mutate({ userId: m.user_id, roleId: v })}
                      >
                        <SelectTrigger className="h-8 w-44 text-xs">
                          <SelectValue placeholder={roleName(m.role_id)} />
                        </SelectTrigger>
                        <SelectContent>
                          {roleList.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{dateShort(m.created_at)}</TableCell>
                    <TableCell className="space-x-1 text-right whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setResetFor({ userId: m.user_id, loginId: m.login_id })}
                      >
                        Change password
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setRemoveFor({ userId: m.user_id, loginId: m.login_id })}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Main administrators (the original admin accounts) always have full access and don't appear
          here. Only they can open this page.
        </p>
      </section>

      {/* Add / edit role */}
      <Dialog open={!!roleDraft} onOpenChange={(o) => !o && setRoleDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{roleDraft?.id ? "Edit role" : "Add a role"}</DialogTitle>
          </DialogHeader>
          {roleDraft && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Role name</Label>
                <Input
                  placeholder="e.g. Content editor"
                  value={roleDraft.name}
                  onChange={(e) => setRoleDraft({ ...roleDraft, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>What can this role open?</Label>
                <div className="space-y-2">
                  {PERMISSION_MODULES.map((m) => (
                    <label key={m.key} className="flex items-start gap-3 rounded-md border border-border p-3">
                      <Checkbox
                        className="mt-0.5"
                        checked={roleDraft.permissions.includes(m.key)}
                        onCheckedChange={(v) =>
                          setRoleDraft({
                            ...roleDraft,
                            permissions: v
                              ? [...roleDraft.permissions, m.key]
                              : roleDraft.permissions.filter((p) => p !== m.key),
                          })
                        }
                      />
                      <span>
                        <span className="block text-sm font-medium">{m.label}</span>
                        <span className="block text-xs text-muted-foreground">{m.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Only main administrators can change passwords, manage roles and add users — staff
                  ask a main administrator to change theirs.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDraft(null)}>
              Cancel
            </Button>
            <Button
              disabled={saveRole.isPending || !roleDraft?.name.trim()}
              onClick={() => roleDraft && saveRole.mutate(roleDraft)}
            >
              {saveRole.isPending ? "Saving…" : "Save role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add user */}
      <Dialog open={userOpen} onOpenChange={setUserOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a user</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name (optional)</Label>
              <Input
                value={user.displayName}
                onChange={(e) => setUser({ ...user, displayName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>User ID</Label>
              <Input
                placeholder="e.g. priya.content"
                autoComplete="off"
                value={user.loginId}
                onChange={(e) => setUser({ ...user, loginId: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                What they type to sign in. Letters, numbers and . _ - only.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input
                type="password"
                autoComplete="new-password"
                value={user.password}
                onChange={(e) => setUser({ ...user, password: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                At least 8 characters. Share it with them privately — they can't change it themselves;
                you can change it any time from this page.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={user.roleId}
                onValueChange={(v) => {
                  if (v === NEW_ROLE) {
                    openNewRole((r) => setUser((u) => ({ ...u, roleId: r.id })));
                  } else {
                    setUser({ ...user, roleId: v });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a role…" />
                </SelectTrigger>
                <SelectContent>
                  {roleList.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                  <SelectItem value={NEW_ROLE}>+ Add new role…</SelectItem>
                </SelectContent>
              </Select>
              {user.roleId && (
                <p className="text-xs text-muted-foreground">
                  Can open:{" "}
                  {roleList
                    .find((r) => r.id === user.roleId)
                    ?.permissions.map(moduleLabel)
                    .join(", ") || "nothing yet"}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={addUser.isPending || !user.loginId.trim() || !user.password || !user.roleId}
              onClick={() => addUser.mutate()}
            >
              {addUser.isPending ? "Adding…" : "Add user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change password */}
      <Dialog open={!!resetFor} onOpenChange={(o) => !o && setResetFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change password for {resetFor?.loginId}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>New password</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetFor(null)}>
              Cancel
            </Button>
            <Button
              disabled={resetPassword.isPending || newPassword.length < 8}
              onClick={() => resetPassword.mutate()}
            >
              {resetPassword.isPending ? "Saving…" : "Change password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete user */}
      <AlertDialog open={!!removeFor} onOpenChange={(o) => !o && setRemoveFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {removeFor?.loginId}?</AlertDialogTitle>
            <AlertDialogDescription>
              Their login is removed and they can no longer sign in. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (removeFor) deleteUser.mutate(removeFor.userId);
              }}
            >
              {deleteUser.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete role */}
      <AlertDialog open={!!roleToDelete} onOpenChange={(o) => !o && setRoleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete the “{roleToDelete?.name}” role?</AlertDialogTitle>
            <AlertDialogDescription>
              A role that still has people assigned can't be deleted — move them to another role
              first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (roleToDelete) deleteRole.mutate(roleToDelete.id);
              }}
            >
              {deleteRole.isPending ? "Deleting…" : "Delete role"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
