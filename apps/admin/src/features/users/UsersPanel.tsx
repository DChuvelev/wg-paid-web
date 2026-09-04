import { type FormEvent, type UIEvent, useEffect, useMemo, useRef, useState } from 'react';
import { type InfiniteData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminUserMetadataUpdateResponse, AdminUserSummary, GrantProtocolLimitSummary, GrantSummary, ProfileSummary } from '@wg-paid/api';
import { ModalDialog } from '../../components/ModalDialog';
import {
  AdminApiError,
  type AdminUserSortBy,
  type AdminUserSortDir,
  deleteUser,
  isUnauthorized,
  loadUsers,
  setWireGuardLimit
} from '../../lib/adminApi';
import { RetirementDialog, type RetirementSelection } from './RetirementDialog';
import { UserCard } from './UserCard';
import { consumesQuota, wireGuardLimit } from './userDomain';
import styles from '../../app/Admin.module.css';

const operationPollIntervalMs = 2500;
const operationPollTimeoutMs = 60000;
const userBatchSize = 100;

function mergeUserPages(pages: Array<Array<AdminUserSummary>> | undefined) {
  const seen = new Set<string>();
  return (pages ?? []).flatMap((page) => page.filter((user) => {
    if (seen.has(user.user_id)) return false;
    seen.add(user.user_id);
    return true;
  }));
}

interface UsersPanelProps {
  onSessionExpired: () => void;
}

interface RetirementOperation {
  deadline: number;
  email: string;
  grantId: string;
  newLimit: number;
  selectedIds: Set<string>;
  userId: string;
}

interface DeletionOperation {
  baselineUpdatedAt: number;
  deadline: number;
  email: string;
  userId: string;
}

export function UsersPanel({ onSessionExpired }: UsersPanelProps) {
  const queryClient = useQueryClient();
  const [draftFilter, setDraftFilter] = useState('');
  const [filter, setFilter] = useState('');
  const [sortBy, setSortBy] = useState<AdminUserSortBy>('created_at');
  const [sortDir, setSortDir] = useState<AdminUserSortDir>('desc');
  const [userRequestPending, setUserRequestPending] = useState(false);
  const [status, setStatus] = useState('');
  const [retirementSelection, setRetirementSelection] = useState<RetirementSelection | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUserSummary | null>(null);
  const [retirements, setRetirements] = useState<Map<string, RetirementOperation>>(() => new Map());
  const [deletions, setDeletions] = useState<Map<string, DeletionOperation>>(() => new Map());
  const [pendingLimits, setPendingLimits] = useState<Set<string>>(() => new Set());
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(() => new Set());
  const pendingLimitIds = useRef(new Set<string>());
  const pendingDeleteIds = useRef(new Set<string>());
  const hasPolling = retirements.size > 0 || deletions.size > 0;
  const usersKey = ['admin', 'users', filter, sortBy, sortDir] as const;

  const usersQuery = useInfiniteQuery({
    queryKey: usersKey,
    queryFn: ({ pageParam }) => loadUsers({
      email: filter,
      limit: userBatchSize,
      offset: pageParam,
      sortBy,
      sortDir
    }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => (
      lastPage.length < userBatchSize
        ? undefined
        : pages.reduce((count, page) => count + page.length, 0)
    ),
    refetchInterval: hasPolling ? operationPollIntervalMs : false,
    refetchIntervalInBackground: false,
    retry: false
  });
  const rows = useMemo(() => mergeUserPages(usersQuery.data?.pages), [usersQuery.data?.pages]);

  useEffect(() => {
    if (!userRequestPending || usersQuery.isFetching) return;
    setUserRequestPending(false);
    setStatus((current) => current === 'Loading users…' ? '' : current);
  }, [userRequestPending, usersQuery.isFetching]);

  useEffect(() => {
    if (!usersQuery.error) return;
    if (isUnauthorized(usersQuery.error)) {
      setRetirements(new Map());
      setDeletions(new Map());
      onSessionExpired();
    } else if (hasPolling) {
      setRetirements(new Map());
      setDeletions(new Map());
      setStatus('Automatic refresh stopped after an error. Use Search or List users to check again.');
    }
  }, [hasPolling, onSessionExpired, usersQuery.error]);

  useEffect(() => {
    if (!usersQuery.data) return;
    const now = Date.now();
    let terminalMessage = '';
    const nextRetirements = new Map(retirements);
    for (const [grantId, operation] of retirements) {
      if (now >= operation.deadline) {
        nextRetirements.delete(grantId);
        terminalMessage = `Automatic retirement refresh timed out for ${operation.email}. Use Search or List users to check again.`;
        continue;
      }
      const user = rows.find((item) => item.user_id === operation.userId);
      const grant = user?.grants.find((item) => item.id === operation.grantId);
      const limit = grant ? wireGuardLimit(grant) : undefined;
      if (!user || !grant || !limit) {
        nextRetirements.delete(grantId);
        terminalMessage = 'Automatic retirement refresh stopped because the affected user, grant, or WireGuard limit is unavailable.';
        continue;
      }
      const selectedProfiles = user.profiles.filter((profile) => operation.selectedIds.has(profile.id));
      const allRetired = selectedProfiles.length === operation.selectedIds.size
        && selectedProfiles.every((profile) => !consumesQuota(profile));
      if (limit.profile_count <= operation.newLimit && allRetired) {
        nextRetirements.delete(grantId);
        terminalMessage = `Profile retirement completed for ${operation.email}. WireGuard limit is ${limit.profile_limit}.`;
      }
    }

    const nextDeletions = new Map(deletions);
    for (const [userId, operation] of deletions) {
      if (now >= operation.deadline) {
        nextDeletions.delete(userId);
        terminalMessage = `Automatic refresh timed out for ${operation.email}. Use Refresh to check again.`;
        continue;
      }
      if (usersQuery.dataUpdatedAt <= operation.baselineUpdatedAt) continue;
      const user = rows.find((item) => item.user_id === userId);
      if (!user) {
        nextDeletions.delete(userId);
        terminalMessage = `User ${operation.email} deleted.`;
      } else if (!user.deletion_requested_at) {
        nextDeletions.delete(userId);
        terminalMessage = 'Automatic refresh stopped because deletion state changed. Use Refresh.';
      }
    }

    if (nextRetirements.size !== retirements.size) setRetirements(nextRetirements);
    if (nextDeletions.size !== deletions.size) setDeletions(nextDeletions);
    if (terminalMessage) setStatus(terminalMessage);
  }, [deletions, retirements, rows, usersQuery.data, usersQuery.dataUpdatedAt]);

  const runSearch = (event?: FormEvent) => {
    event?.preventDefault();
    setRetirements(new Map());
    setDeletions(new Map());
    const nextFilter = draftFilter.trim();
    setFilter(nextFilter);
    setUserRequestPending(true);
    setStatus('Loading users…');
    if (nextFilter === filter) void usersQuery.refetch();
  };

  const listAll = () => {
    setDraftFilter('');
    setRetirements(new Map());
    setDeletions(new Map());
    setFilter('');
    setUserRequestPending(true);
    setStatus('Loading users…');
    if (!filter) void usersQuery.refetch();
  };

  const changeSort = (nextSortBy: AdminUserSortBy) => {
    setRetirements(new Map());
    setDeletions(new Map());
    setStatus('Loading users…');
    setUserRequestPending(true);
    if (nextSortBy === sortBy) {
      setSortDir((current) => current === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(nextSortBy);
      setSortDir(nextSortBy === 'created_at' ? 'desc' : 'asc');
    }
  };

  const loadNextBatch = (event: UIEvent<HTMLDivElement>) => {
    const list = event.currentTarget;
    const remaining = list.scrollHeight - list.scrollTop - list.clientHeight;
    if (remaining <= 320 && usersQuery.hasNextPage && !usersQuery.isFetchingNextPage) {
      void usersQuery.fetchNextPage();
    }
  };

  const handleError = (error: unknown, fallback: string) => {
    if (isUnauthorized(error)) onSessionExpired();
    else setStatus(error instanceof AdminApiError ? error.message : fallback);
  };

  const submitLimit = async (user: AdminUserSummary, grantId: string, newLimit: number, selectedIds: Array<string>) => {
    if (pendingLimitIds.current.has(grantId) || retirements.has(grantId)) return;
    pendingLimitIds.current.add(grantId);
    setPendingLimits((current) => new Set(current).add(grantId));
    setStatus(selectedIds.length ? 'Submitting profile retirement…' : 'Updating limit…');
    try {
      const result = await setWireGuardLimit(grantId, newLimit, selectedIds);
      setRetirementSelection(null);
      if (result.retirement_in_progress) {
        setRetirements((current) => new Map(current).set(grantId, {
          deadline: Date.now() + operationPollTimeoutMs,
          email: user.email,
          grantId,
          newLimit,
          selectedIds: new Set(selectedIds),
          userId: user.user_id
        }));
        setStatus(`Profile retirement in progress for ${user.email}. Refreshing automatically…`);
      } else {
        setStatus('WireGuard profile limit updated.');
      }
      await usersQuery.refetch();
    } catch (error) {
      handleError(error, 'Unable to update profile limit.');
    } finally {
      pendingLimitIds.current.delete(grantId);
      setPendingLimits((current) => {
        const next = new Set(current);
        next.delete(grantId);
        return next;
      });
    }
  };

  const requestLimit = (
    user: AdminUserSummary,
    grant: GrantSummary,
    limit: GrantProtocolLimitSummary,
    profiles: Array<ProfileSummary>,
    nextLimit: number
  ) => {
    if (limit.profile_count > nextLimit) {
      setRetirementSelection({ grant, limit, newLimit: nextLimit, profiles, user });
      setStatus(`Retirement selection required for ${user.email}. No limit change has been submitted.`);
      return;
    }
    void submitLimit(user, grant.id, nextLimit, []);
  };

  const confirmDelete = async () => {
    const user = deleteTarget;
    if (!user || pendingDeleteIds.current.has(user.user_id) || deletions.has(user.user_id)) return;
    pendingDeleteIds.current.add(user.user_id);
    setDeleteTarget(null);
    setPendingDeletes((current) => new Set(current).add(user.user_id));
    setStatus(`Requesting deletion for ${user.email}…`);
    try {
      const result = await deleteUser(user.user_id);
      if (result.status === 'deleted') {
        setStatus(`User ${user.email} deleted.`);
      } else if (result.status === 'blocked_legacy_dependencies') {
        setStatus(`Deletion blocked by ${result.legacy_dependency_count} legacy dependency row(s).`);
      } else if (result.status === 'deleting') {
        setDeletions((current) => new Map(current).set(user.user_id, {
          baselineUpdatedAt: usersQuery.dataUpdatedAt,
          deadline: Date.now() + operationPollTimeoutMs,
          email: user.email,
          userId: user.user_id
        }));
        setStatus(`Deletion in progress for ${user.email}. Refreshing automatically…`);
      }
      await usersQuery.refetch();
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 409) setStatus('User cannot be deleted in the current state.');
      else handleError(error, 'Unable to delete user.');
    } finally {
      pendingDeleteIds.current.delete(user.user_id);
      setPendingDeletes((current) => {
        const next = new Set(current);
        next.delete(user.user_id);
        return next;
      });
    }
  };

  const refreshDeleting = async (user: AdminUserSummary) => {
    setDeletions((current) => new Map(current).set(user.user_id, {
      baselineUpdatedAt: usersQuery.dataUpdatedAt,
      deadline: Date.now() + operationPollTimeoutMs,
      email: user.email,
      userId: user.user_id
    }));
    setStatus(`Refreshing deletion state for ${user.email}…`);
    await usersQuery.refetch();
  };

  const retirementGrantsByUser = useMemo(() => {
    const result = new Map<string, Set<string>>();
    for (const operation of retirements.values()) {
      const grants = result.get(operation.userId) ?? new Set<string>();
      grants.add(operation.grantId);
      result.set(operation.userId, grants);
    }
    return result;
  }, [retirements]);

  const updateCachedMetadata = (updated: AdminUserMetadataUpdateResponse) => {
    queryClient.setQueryData<InfiniteData<Array<AdminUserSummary>>>(usersKey, (current) => current ? ({
      ...current,
      pages: current.pages.map((page) => page.map((user) => user.user_id === updated.user_id
        ? { ...user, admin_note: updated.admin_note, display_name: updated.display_name }
        : user))
    }) : current);
  };

  const defaultStatus = usersQuery.isPending
    ? 'Loading users…'
    : usersQuery.isError
      ? 'Unable to load users.'
      : rows.length
        ? `Loaded ${rows.length} user(s).`
        : 'No users found.';

  const sortHeader = (label: string, field: AdminUserSortBy) => (
    <button
      className={styles.sortButton}
      type="button"
      aria-label={`Sort by ${label}`}
      onClick={() => changeSort(field)}
    >
      {label}<span aria-hidden="true">{sortBy === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</span>
    </button>
  );

  return (
    <section className={styles.sectionCard} id="users" aria-labelledby="users-title">
      <div className={styles.sectionHeading}>
        <div><p className={styles.eyebrow}>Accounts & connections</p><h2 id="users-title">Users</h2></div>
        {usersQuery.data ? <span className={styles.loadedCount}>Loaded {rows.length}</span> : null}
      </div>
      <form className={styles.searchForm} onSubmit={runSearch}>
        <label className={styles.field}>
          <span>Email contains or exact</span>
          <input autoComplete="off" type="email" value={draftFilter} onChange={(event) => setDraftFilter(event.target.value)} />
        </label>
        <button className={styles.primaryButton} type="submit">Search</button>
        <button className={styles.secondaryButton} type="button" onClick={listAll}>List users</button>
      </form>
      <p className={styles.statusLine} role="status" aria-live="polite">{status || defaultStatus}</p>
      <div
        className={styles.userListViewport}
        aria-busy={usersQuery.isFetching}
        aria-label="Users list"
        onScroll={loadNextBatch}
      >
        <div className={styles.userTableHeader} role="row">
          <span role="columnheader" aria-sort={sortBy === 'email' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>{sortHeader('Email', 'email')}</span>
          <span role="columnheader" aria-sort={sortBy === 'display_name' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>{sortHeader('Name', 'display_name')}</span>
          <span role="columnheader">Connections</span>
          <span role="columnheader" aria-sort={sortBy === 'created_at' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>{sortHeader('User since', 'created_at')}</span>
          <span role="columnheader" aria-sort={sortBy === 'invite_issued_at' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>{sortHeader('Invite issued', 'invite_issued_at')}</span>
          <span role="columnheader" aria-sort={sortBy === 'invite_redeemed_at' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>{sortHeader('Joined', 'invite_redeemed_at')}</span>
          <span role="columnheader" aria-sort={sortBy === 'invited_by_label' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>{sortHeader('Invited by', 'invited_by_label')}</span>
          <span aria-hidden="true" />
        </div>
        <div className={styles.userMobileHeader} role="row">
          <span role="columnheader">Email / Name</span>
          <span role="columnheader">Connections</span>
          <span aria-hidden="true" />
        </div>
        <div className={styles.userList}>
        {rows.map((user) => (
          <UserCard
            deletingActive={deletions.has(user.user_id) || pendingDeletes.has(user.user_id)}
            key={user.user_id}
            limitPending={pendingLimits}
            retirementGrants={retirementGrantsByUser.get(user.user_id) ?? new Set()}
            user={user}
            onMetadataUpdated={updateCachedMetadata}
            onRequestError={(error) => handleError(error, 'Unable to update the admin note.')}
            onDelete={() => setDeleteTarget(user)}
            onLimitRequest={(grant, limit, profiles, nextLimit) => requestLimit(user, grant, limit, profiles, nextLimit)}
            onRefreshDeleting={() => void refreshDeleting(user)}
          />
        ))}
        </div>
        {usersQuery.isFetchingNextPage ? <p className={styles.loadingMore} role="status">Loading more users…</p> : null}
      </div>

      {retirementSelection ? (
        <RetirementDialog
          pending={pendingLimits.has(retirementSelection.grant.id)}
          selection={retirementSelection}
          onCancel={() => {
            setRetirementSelection(null);
            setStatus('Retirement selection cancelled.');
          }}
          onConfirm={(ids) => void submitLimit(retirementSelection.user, retirementSelection.grant.id, retirementSelection.newLimit, ids)}
        />
      ) : null}

      {deleteTarget ? (
        <ModalDialog title={`Delete ${deleteTarget.email}?`} onClose={() => setDeleteTarget(null)}>
          <div className={styles.warningBox}>
            This immediately revokes sessions and access. Active WireGuard profiles will be disabled and removed before the account is finally deleted.
          </div>
          <p>This action cannot be undone.</p>
          <div className={styles.dialogActions}>
            <button className={styles.secondaryButton} type="button" onClick={() => setDeleteTarget(null)}>Cancel</button>
            <button className={styles.dangerButton} type="button" onClick={() => void confirmDelete()}>Delete user</button>
          </div>
        </ModalDialog>
      ) : null}
    </section>
  );
}
