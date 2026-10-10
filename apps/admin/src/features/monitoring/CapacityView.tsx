import type { AdminCapacityResponse } from '@wg-paid/api';
import { guestKeys, numberText, rateText, statusText, utcText, vmKeys } from './monitoringDomain';
import styles from './Monitoring.module.css';

export function CapacityView({ data }: { data: AdminCapacityResponse }) {
  const snapshot = data.snapshot;
  return <section className={styles.panel} aria-labelledby="capacity-title">
    <h4 id="capacity-title">Ресурсы и ёмкость</h4>
    <p>{statusText(data.status)} · Снимок: {utcText(data.snapshot_at_utc)} · Возраст: {numberText(data.age_seconds, ' с')} · Порог свежести: {numberText(data.freshness_threshold_seconds, ' с')}</p>
    <p className={styles.note}>Последний снимок с агрегатами Proxmox RRD за сутки/неделю. Это не ряд измерений в реальном времени и не подтверждение доступности туннеля.</p>
    {!snapshot ? <p>Снимок ресурсов отсутствует.</p> : <>
      <p>Источник: vm130_resource_monitor · {statusText(snapshot.source_status)} · Сформирован: {utcText(snapshot.generated_at_utc)}</p>
      <p>Таблицы можно прокручивать по горизонтали.</p>
      <div className={styles.scroll} tabIndex={0} role="region" aria-label="Ресурсы виртуальных машин">
        <table className={styles.table}>
          <caption>VM100 / VM101 / VM103 / VM130 — сутки и неделя</caption>
          <thead><tr>{['VM / vCPU / статус', 'Период / статус', 'CPU avg / p95 (%)', 'RAM p95 (%)', 'Сеть in / out p95', 'Диск read / write p95', 'Возраст / точки'].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{vmKeys.flatMap((key) => {
            const vm = snapshot.vms[key];
            return (['day', 'week'] as const).map((period) => {
              const values = vm?.[period];
              return <tr key={`${key}-${period}`}>
                <th scope="row">{key.toUpperCase()} / {numberText(vm?.vcpus)} vCPU / {statusText(vm?.status)}</th>
                <td>{period === 'day' ? 'Сутки' : 'Неделя'} / {statusText(values?.status)}</td>
                <td>{numberText(values?.cpu_avg_pct, ' %')} / {numberText(values?.cpu_p95_pct, ' %')}</td>
                <td>{numberText(values?.mem_p95_pct, ' %')}</td>
                <td>{rateText(values?.netin_p95_bytes_per_sec)} / {rateText(values?.netout_p95_bytes_per_sec)}</td>
                <td>{rateText(values?.diskread_p95_bytes_per_sec)} / {rateText(values?.diskwrite_p95_bytes_per_sec)}</td>
                <td>{numberText(values?.latest_age_sec, ' с')} / {numberText(values?.points)}</td>
              </tr>;
            });
          })}</tbody>
        </table>
      </div>
      {snapshot.vms.vm100?.vcpus === 1 ? <p className={styles.note}>VM100: 1 vCPU — наблюдаемая конфигурация. Это само по себе не доказывает неисправность и не задаёт рекомендацию увеличить CPU.</p> : null}
      <div className={styles.scroll} tabIndex={0} role="region" aria-label="Память и PSI гостевых систем">
        <table className={styles.table}>
          <caption>Гостевые системы: RAM и PSI avg300</caption>
          <thead><tr>{['Гость / статус', 'RAM всего / доступно', 'RAM доступно (%)', 'Swap', 'PSI CPU / memory / IO (%)'].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{guestKeys.map((key) => {
            const guest = snapshot.guests[key];
            return <tr key={key}>
              <th scope="row">{key.toUpperCase()} / {statusText(guest?.status)}</th>
              <td>{numberText(guest?.mem_total_mib, ' MiB')} / {numberText(guest?.mem_available_mib, ' MiB')}</td>
              <td>{numberText(guest?.mem_available_pct, ' %')}</td><td>{numberText(guest?.swap_used_mib, ' MiB')}</td>
              <td>{numberText(guest?.psi_cpu_avg300, ' %')} / {numberText(guest?.psi_memory_avg300, ' %')} / {numberText(guest?.psi_io_avg300, ' %')}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <div className={styles.grid}>
        <div className={styles.card}><h4>Узел Proxmox</h4><p>{statusText(snapshot.node.status)}</p>
          <p>CPU: {numberText(snapshot.node.cpu_count)} · RAM использовано: {numberText(snapshot.node.mem_used_pct, ' %')}</p>
          <p>CPU avg сутки / неделя: {numberText(snapshot.node.day_cpu_avg_pct, ' %')} / {numberText(snapshot.node.week_cpu_avg_pct, ' %')}</p>
        </div>
        <div className={styles.card}><h4>Физический NIC</h4><p>{statusText(snapshot.nic.status)}</p>
          <p>Наблюдаемый link: {snapshot.nic.link_up === true ? 'поднят' : snapshot.nic.link_up === false ? 'не поднят' : '—'} · {numberText(snapshot.nic.link_mbps, ' Mbps')}</p>
        </div>
      </div>
    </>}
  </section>;
}
