function formatErrSafe(value) {
  return String(value ?? "").replace(/"/g, "&quot;");
}

export function renderMonthlySummary(rows) {
  const target = document.getElementById("summary-table");
  if (!target) return;

  if (!rows || !rows.length) {
    target.innerHTML = '<p class="status">No summary data for selected filters.</p>';
    return;
  }

  const body = rows
    .map(
      (r) => `<tr>
        <td>${r.month}</td>
        <td>${Number(r.value_gbp).toFixed(2)}</td>
        <td>${Number(r.adherence_pct).toFixed(1)}%</td>
        <td>${r.workout_days}</td>
        <td>${r.total_sessions}</td>
        <td>${r.gym}</td>
        <td>${r.pool_swim}</td>
        <td>${r.lido_res_swim}</td>
      </tr>`
    )
    .join("");

  target.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Month</th>
          <th>Value GBP</th>
          <th>Adherence</th>
          <th>Days</th>
          <th>Sessions</th>
          <th>Gym</th>
          <th>Pool</th>
          <th>Lido/Res</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

function renderHistoryTable(containerId, rows, columns, kind) {
  const target = document.getElementById(containerId);
  if (!target) return;

  if (!rows || !rows.length) {
    target.innerHTML = '<p class="status">No entries yet.</p>';
    return;
  }

  const thead = columns.map((c) => `<th>${c.label}</th>`).join("");
  const body = rows
    .map((row) => {
      const tds = columns.map((c) => `<td>${row[c.key] ?? ""}</td>`).join("");
      return `<tr>
        ${tds}
        <td>
          <span class="history-actions">
            <button class="action-btn" data-action="edit" data-kind="${kind}" data-id="${row.id}" data-date="${formatErrSafe(row.date)}" data-weight="${formatErrSafe(row.weight_kg)}" data-dose="${formatErrSafe(row.dose_mg)}" data-workout-type="${formatErrSafe(row.workout_type)}">Edit</button>
            <button class="action-btn" data-action="delete" data-kind="${kind}" data-id="${row.id}">Delete</button>
          </span>
        </td>
      </tr>`;
    })
    .join("");

  target.innerHTML = `
    <table>
      <thead>
        <tr>
          ${thead}
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

export function renderHistoryByKind(containerId, history, kind) {
  if (kind === "weigh") {
    renderHistoryTable(
      containerId,
      history.weigh_ins || [],
      [
        { key: "date", label: "Date" },
        { key: "weight_kg", label: "Weight" },
      ],
      "weigh"
    );
    return;
  }

  if (kind === "injection") {
    renderHistoryTable(
      containerId,
      history.injections || [],
      [
        { key: "date", label: "Date" },
        { key: "dose_mg", label: "Dose" },
      ],
      "injection"
    );
    return;
  }

  renderHistoryTable(
    containerId,
    history.workouts || [],
    [
      { key: "date", label: "Date" },
      { key: "workout_type", label: "Type" },
      { key: "workout_value_gbp", label: "GBP" },
    ],
    "workout"
  );
}

export function renderHistory(history) {
  renderHistoryTable(
    "history-weigh",
    history.weigh_ins || [],
    [
      { key: "date", label: "Date" },
      { key: "weight_kg", label: "Weight" },
    ],
    "weigh"
  );

  renderHistoryTable(
    "history-injection",
    history.injections || [],
    [
      { key: "date", label: "Date" },
      { key: "dose_mg", label: "Dose" },
    ],
    "injection"
  );

  renderHistoryTable(
    "history-workout",
    history.workouts || [],
    [
      { key: "date", label: "Date" },
      { key: "workout_type", label: "Type" },
      { key: "workout_value_gbp", label: "GBP" },
    ],
    "workout"
  );
}
