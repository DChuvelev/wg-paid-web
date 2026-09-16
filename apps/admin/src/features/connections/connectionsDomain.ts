import type { AdminRuntimeConnectionRow } from '@wg-paid/api';

export const selectors = ['cs1', 'cs2', 'cs3', 'cs4', 'cs5'] as const;
export const runtimeConnectionsKey = ['admin', 'runtime', 'connections'] as const;

export type RuntimeStatus = 'now' | 'active' | 'idle' | 'never_seen';
export type RuntimeProtocol = AdminRuntimeConnectionRow['protocol'];
export type ConnectionSortKey = 'user' | 'status' | 'selector' | 'last_handshake' | 'last_activity';
export type SortDirection = 'asc' | 'desc';

export interface ConnectionFilters {
  protocols: ReadonlySet<RuntimeProtocol>;
  search: string;
  selectors: ReadonlySet<string>;
  statuses: ReadonlySet<RuntimeStatus>;
}

export interface ConnectionSort {
  direction: SortDirection;
  key: ConnectionSortKey;
}

export interface RuntimeConfigurationGroup {
  configurationId: string;
  label: string | null;
  ordinal: number;
  rows: Array<AdminRuntimeConnectionRow>;
  totalRows: number;
}

export interface RuntimeUserGroup {
  configurations: Array<RuntimeConfigurationGroup>;
  displayName: string | null;
  email: string;
  userId: string;
}

export function runtimeStatus(row: AdminRuntimeConnectionRow): RuntimeStatus {
  if (row.active_now) return 'now';
  if (row.active_state) return 'active';
  if (row.last_handshake_at !== null) return 'idle';
  return 'never_seen';
}

const byteUnits = ['B', 'KiB', 'MiB', 'GiB', 'TiB'] as const;
const byteNumber = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

export function formatBytes(value: number) {
  if (!Number.isFinite(value)) return '—';
  const normalized = Math.max(0, value);
  const unitIndex = Math.min(
    normalized > 0 ? Math.floor(Math.log(normalized) / Math.log(1024)) : 0,
    byteUnits.length - 1
  );
  return `${byteNumber.format(normalized / (1024 ** unitIndex))} ${byteUnits[unitIndex]}`;
}

export function formatByteRate(value: number) {
  const formatted = formatBytes(value);
  return formatted === '—' ? formatted : `${formatted}/s`;
}

export function formatTimestamp(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export function configurationName(configuration: Pick<RuntimeConfigurationGroup, 'label' | 'ordinal'>) {
  return configuration.label?.trim() || `Configuration #${configuration.ordinal}`;
}

export function protocolBadge(protocol: RuntimeProtocol) {
  return protocol === 'wireguard' ? 'WG' : 'AWG';
}

export function profileIdentity(row: AdminRuntimeConnectionRow) {
  return row.profile_label?.trim() || row.tunnel_ip;
}

export function activeRowsForSelector(rows: Array<AdminRuntimeConnectionRow>, selector: string) {
  return rows.filter((row) => row.selector === selector && row.active_state);
}

const statusRank: Record<RuntimeStatus, number> = {
  now: 0,
  active: 1,
  idle: 2,
  never_seen: 3
};

function normalized(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase() ?? '';
}

function compareText(first: string, second: string) {
  if (first === second) return 0;
  return first < second ? -1 : 1;
}

function protocolOrder(row: AdminRuntimeConnectionRow) {
  return row.protocol === 'wireguard' ? 0 : 1;
}

function sortProtocolRows(rows: Array<AdminRuntimeConnectionRow>) {
  return [...rows].sort((first, second) => (
    protocolOrder(first) - protocolOrder(second)
    || compareText(first.profile_id, second.profile_id)
  ));
}

function userMatches(row: AdminRuntimeConnectionRow, search: string) {
  return [row.display_name, row.email, row.user_id]
    .some((value) => normalized(value).includes(search));
}

function configurationMatches(row: AdminRuntimeConnectionRow, search: string) {
  return [
    row.configuration_label,
    row.configuration_id,
    `configuration #${row.configuration_ordinal}`,
    `#${row.configuration_ordinal}`
  ].some((value) => normalized(value).includes(search));
}

function rowMatchesFilters(row: AdminRuntimeConnectionRow, filters: ConnectionFilters) {
  return (filters.statuses.size === 0 || filters.statuses.has(runtimeStatus(row)))
    && (filters.selectors.size === 0 || filters.selectors.has(row.selector))
    && (filters.protocols.size === 0 || filters.protocols.has(row.protocol));
}

function mostActiveStatus(rows: Array<AdminRuntimeConnectionRow>) {
  return Math.min(...rows.map((row) => statusRank[runtimeStatus(row)]));
}

function selectorTuple(rows: Array<AdminRuntimeConnectionRow>) {
  return [...new Set(rows.map((row) => row.selector))].sort(compareText).join('\u0000');
}

function latestTimestamp(rows: Array<AdminRuntimeConnectionRow>, field: 'last_handshake_at' | 'last_active_at') {
  const values = rows
    .map((row) => row[field] ? Date.parse(row[field]) : Number.NaN)
    .filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
}

function compareNullableNumber(first: number | null, second: number | null, direction: SortDirection) {
  if (first === null && second === null) return 0;
  if (first === null) return 1;
  if (second === null) return -1;
  return (first - second) * (direction === 'asc' ? 1 : -1);
}

function comparePrimaryRows(
  first: Array<AdminRuntimeConnectionRow>,
  second: Array<AdminRuntimeConnectionRow>,
  sort: ConnectionSort
) {
  const direction = sort.direction === 'asc' ? 1 : -1;
  if (sort.key === 'status') {
    return (mostActiveStatus(first) - mostActiveStatus(second)) * direction;
  }
  if (sort.key === 'selector') {
    return compareText(selectorTuple(first), selectorTuple(second)) * direction;
  }
  if (sort.key === 'last_handshake') {
    return compareNullableNumber(
      latestTimestamp(first, 'last_handshake_at'),
      latestTimestamp(second, 'last_handshake_at'),
      sort.direction
    );
  }
  if (sort.key === 'last_activity') {
    return compareNullableNumber(
      latestTimestamp(first, 'last_active_at'),
      latestTimestamp(second, 'last_active_at'),
      sort.direction
    );
  }
  return 0;
}

function userRows(group: RuntimeUserGroup) {
  return group.configurations.flatMap((configuration) => configuration.rows);
}

function compareUsers(first: RuntimeUserGroup, second: RuntimeUserGroup, sort: ConnectionSort) {
  let primary = 0;
  if (sort.key === 'user') {
    const firstIdentity = normalized(first.displayName) || normalized(first.email);
    const secondIdentity = normalized(second.displayName) || normalized(second.email);
    primary = compareText(firstIdentity, secondIdentity) * (sort.direction === 'asc' ? 1 : -1);
  } else {
    primary = comparePrimaryRows(userRows(first), userRows(second), sort);
  }
  return primary
    || compareText(normalized(first.email), normalized(second.email))
    || compareText(first.userId, second.userId);
}

function compareConfigurations(
  first: RuntimeConfigurationGroup,
  second: RuntimeConfigurationGroup,
  sort: ConnectionSort
) {
  const primary = sort.key === 'user' ? 0 : comparePrimaryRows(first.rows, second.rows, sort);
  return primary
    || first.ordinal - second.ordinal
    || compareText(first.configurationId, second.configurationId);
}

export function groupRuntimeConnections(
  rows: Array<AdminRuntimeConnectionRow>,
  filters: ConnectionFilters,
  sort: ConnectionSort
): Array<RuntimeUserGroup> {
  const search = normalized(filters.search);
  const sourceUsers = new Map<string, Array<AdminRuntimeConnectionRow>>();
  for (const row of rows) {
    const existing = sourceUsers.get(row.user_id) ?? [];
    existing.push(row);
    sourceUsers.set(row.user_id, existing);
  }

  const users: Array<RuntimeUserGroup> = [];
  for (const [userId, sourceUserRows] of sourceUsers) {
    const sourceConfigurations = new Map<string, Array<AdminRuntimeConnectionRow>>();
    for (const row of sourceUserRows) {
      const existing = sourceConfigurations.get(row.configuration_id) ?? [];
      existing.push(row);
      sourceConfigurations.set(row.configuration_id, existing);
    }

    const matchesUser = !search || sourceUserRows.some((row) => userMatches(row, search));
    const configurations: Array<RuntimeConfigurationGroup> = [];
    for (const [configurationId, sourceConfigurationRows] of sourceConfigurations) {
      if (search && !matchesUser && !sourceConfigurationRows.some((row) => configurationMatches(row, search))) {
        continue;
      }
      const visibleRows = sourceConfigurationRows.filter((row) => rowMatchesFilters(row, filters));
      if (visibleRows.length === 0) continue;
      const representative = sourceConfigurationRows[0]!;
      configurations.push({
        configurationId,
        label: representative.configuration_label,
        ordinal: representative.configuration_ordinal,
        rows: sortProtocolRows(visibleRows),
        totalRows: sourceConfigurationRows.length
      });
    }
    if (configurations.length === 0) continue;
    const representative = sourceUserRows[0]!;
    const user: RuntimeUserGroup = {
      configurations,
      displayName: representative.display_name,
      email: representative.email,
      userId
    };
    user.configurations.sort((first, second) => compareConfigurations(first, second, sort));
    users.push(user);
  }

  return users.sort((first, second) => compareUsers(first, second, sort));
}
