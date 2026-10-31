/* ============================================================
   script.js — Dashboard Penjualan 2024
   Vanilla JavaScript | Chart.js v4 | Data dari data.json
   ============================================================

   Alur kerja:
   1. Fetch data.json saat halaman dimuat
   2. Isi opsi filter secara dinamis dari data
   3. Hitung KPI dari data yang sudah difilter
   4. Render/update semua chart Chart.js
   5. Setiap perubahan filter → re-filter → re-render semua

   ============================================================ */

'use strict';

/* ============================================================
   BAGIAN 1: KONSTANTA WARNA & UTILITAS
   ============================================================ */

/** Palet warna konsisten untuk semua chart */
const COLORS = {
  blue:   'rgba(59, 130, 246, 0.85)',
  purple: 'rgba(139, 92, 246, 0.85)',
  green:  'rgba(16, 185, 129, 0.85)',
  amber:  'rgba(245, 158, 11, 0.85)',
  red:    'rgba(239, 68, 68, 0.85)',
  cyan:   'rgba(6, 182, 212, 0.85)',
  pink:   'rgba(236, 72, 153, 0.85)',
  indigo: 'rgba(99, 102, 241, 0.85)',
  teal:   'rgba(20, 184, 166, 0.85)',
  orange: 'rgba(249, 115, 22, 0.85)',
  // Versi solid (tanpa alpha) untuk border
  blueSolid:   'rgb(59, 130, 246)',
  purpleSolid: 'rgb(139, 92, 246)',
  greenSolid:  'rgb(16, 185, 129)',
  amberSolid:  'rgb(245, 158, 11)',
  redSolid:    'rgb(239, 68, 68)',
  cyanSolid:   'rgb(6, 182, 212)',
  pinkSolid:   'rgb(236, 72, 153)',
};

/** Array warna untuk chart multi-kategori */
const PALETTE = [
  COLORS.blue, COLORS.purple, COLORS.green, COLORS.amber,
  COLORS.red,  COLORS.cyan,   COLORS.pink,  COLORS.indigo,
  COLORS.teal, COLORS.orange,
];
const PALETTE_SOLID = [
  COLORS.blueSolid, COLORS.purpleSolid, COLORS.greenSolid, COLORS.amberSolid,
  COLORS.redSolid,  COLORS.cyanSolid,   COLORS.pinkSolid,
];

/**
 * Format angka sebagai Rupiah
 * @param {number} value
 * @returns {string} misal: "Rp 1,25 M" atau "Rp 850.000"
 */
function formatRupiah(value) {
  if (value >= 1_000_000_000) {
    return 'Rp ' + (value / 1_000_000_000).toFixed(2) + ' B';
  } else if (value >= 1_000_000) {
    return 'Rp ' + (value / 1_000_000).toFixed(2) + ' Jt';
  } else {
    return 'Rp ' + value.toLocaleString('id-ID');
  }
}

/**
 * Format persentase dengan 2 desimal
 * @param {number} value  0.0 – 1.0
 * @returns {string}
 */
function formatPercent(value) {
  return (value * 100).toFixed(1) + '%';
}

/**
 * Konfigurasi tooltip default Chart.js agar tampil rapi
 */
const defaultTooltip = {
  backgroundColor: 'rgba(17, 24, 39, 0.92)',
  titleColor: '#f9fafb',
  bodyColor: '#d1d5db',
  borderColor: 'rgba(255,255,255,0.08)',
  borderWidth: 1,
  padding: 10,
  cornerRadius: 8,
  displayColors: true,
  boxWidth: 10,
  boxHeight: 10,
  boxPadding: 4,
};

/**
 * Konfigurasi legend default
 */
const defaultLegend = {
  position: 'bottom',
  labels: {
    font: { size: 11 },
    color: '#6b7280',
    padding: 14,
    usePointStyle: true,
    pointStyleWidth: 8,
  },
};

/* ============================================================
   BAGIAN 2: STATE GLOBAL
   ============================================================ */

/** Data mentah (semua transaksi dari JSON) */
let rawData = [];

/** Instance chart yang disimpan agar bisa di-destroy saat update */
const charts = {};

/* ============================================================
   BAGIAN 3: ENTRY POINT — Fetch JSON & Init Dashboard
   ============================================================ */

/**
 * Entry point utama — dipanggil saat DOM siap.
 * Fetch data.json, simpan ke rawData, lalu inisialisasi dashboard.
 */
async function initDashboard() {
  setStatus('loading');

  try {
    const response = await fetch('data.json');
    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

    rawData = await response.json();

    // Hitung revenue setiap transaksi sekali saja di sini (cached property)
    rawData = rawData.map(d => ({
      ...d,
      revenue: d.quantity * d.unit_price * (1 - d.discount),
    }));

    // Isi opsi dropdown filter dari data unik
    populateFilters();

    // Render dashboard pertama kali dengan semua data
    renderDashboard();

    // Pasang event listener untuk semua filter
    attachFilterListeners();

    setStatus('ready', rawData.length);

  } catch (err) {
    console.error('Gagal memuat data:', err);
    setStatus('error');
  }
}

/* ============================================================
   BAGIAN 4: STATUS INDICATOR
   ============================================================ */

function setStatus(state, count = 0) {
  const dot  = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  if (!dot || !text) return;

  if (state === 'loading') {
    dot.className  = 'w-2 h-2 rounded-full bg-amber-400 animate-pulse';
    text.textContent = 'Memuat data…';
  } else if (state === 'ready') {
    dot.className  = 'w-2 h-2 rounded-full bg-emerald-500';
    text.textContent = `${count} transaksi dimuat`;
  } else if (state === 'error') {
    dot.className  = 'w-2 h-2 rounded-full bg-red-500';
    text.textContent = 'Gagal memuat data';
  }
}

/* ============================================================
   BAGIAN 5: POPULATE FILTER DROPDOWN
   ============================================================ */

/**
 * Mengambil nilai unik dari rawData dan mengisi opsi select filter.
 * Dipanggil sekali setelah data dimuat.
 */
function populateFilters() {
  const fields = {
    'filter-region':   'region',
    'filter-category': 'product_category',
    'filter-customer': 'customer_type',
    'filter-channel':  'sales_channel',
  };

  Object.entries(fields).forEach(([selectId, field]) => {
    const select = document.getElementById(selectId);
    if (!select) return;

    // Ambil nilai unik, urutkan alfabetis
    const uniqueValues = [...new Set(rawData.map(d => d[field]))].sort();

    uniqueValues.forEach(val => {
      const option = document.createElement('option');
      option.value = val;
      option.textContent = val;
      select.appendChild(option);
    });
  });

  // Set total count label
  const totalEl = document.getElementById('total-count');
  if (totalEl) totalEl.textContent = rawData.length;
}

/* ============================================================
   BAGIAN 6: EVENT LISTENER FILTER
   ============================================================ */

/**
 * Pasang listener 'change' pada semua select filter.
 * Setiap perubahan akan memicu re-render dashboard.
 */
function attachFilterListeners() {
  const filterIds = ['filter-region', 'filter-category', 'filter-customer', 'filter-channel'];

  filterIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', renderDashboard);
  });

  // Tombol reset filter
  const resetBtn = document.getElementById('btn-reset-filter');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      filterIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = 'all';
      });
      renderDashboard();
    });
  }
}

/* ============================================================
   BAGIAN 7: LOGIKA FILTER DATA
   ============================================================ */

/**
 * Membaca nilai filter saat ini dan mengembalikan subset data.
 * @returns {Array} data yang sudah difilter
 */
function getFilteredData() {
  const region   = document.getElementById('filter-region')?.value   || 'all';
  const category = document.getElementById('filter-category')?.value || 'all';
  const customer = document.getElementById('filter-customer')?.value || 'all';
  const channel  = document.getElementById('filter-channel')?.value  || 'all';

  return rawData.filter(d => {
    return (region   === 'all' || d.region           === region)
        && (category === 'all' || d.product_category === category)
        && (customer === 'all' || d.customer_type    === customer)
        && (channel  === 'all' || d.sales_channel    === channel);
  });
}

/* ============================================================
   BAGIAN 8: RENDER DASHBOARD (orchestrator)
   ============================================================ */

/**
 * Fungsi utama yang dipanggil saat data pertama dimuat atau filter berubah.
 * Mengambil data terfilter, lalu memperbarui KPI dan semua chart.
 */
function renderDashboard() {
  const data = getFilteredData();

  // Update jumlah transaksi terfilter
  const filteredEl = document.getElementById('filtered-count');
  if (filteredEl) filteredEl.textContent = data.length;

  // Render KPI
  updateKPI(data);

  // Render semua chart
  renderSalesTrend(data);
  renderRevenueRegion(data);
  renderRevenueCategory(data);
  renderSalesRep(data);
  renderCustomerType(data);
  renderPaymentMethod(data);
  renderSalesChannel(data);
  renderScatter(data);
  renderTop10(data);
  renderQtyCategory(data);
}

/* ============================================================
   BAGIAN 9: KPI CALCULATION & DISPLAY
   ============================================================ */

/**
 * Menghitung dan menampilkan 4 KPI utama dari data terfilter.
 * @param {Array} data
 */
function updateKPI(data) {
  // Total revenue (setelah diskon)
  const totalRevenue = data.reduce((sum, d) => sum + d.revenue, 0);

  // Total transaksi
  const totalTransactions = data.length;

  // Total quantity terjual
  const totalQty = data.reduce((sum, d) => sum + d.quantity, 0);

  // Rata-rata diskon
  const avgDiscount = data.length > 0
    ? data.reduce((sum, d) => sum + d.discount, 0) / data.length
    : 0;

  // Tampilkan ke DOM
  setKPI('kpi-revenue',      formatRupiah(totalRevenue));
  setKPI('kpi-transactions', totalTransactions.toLocaleString('id-ID'));
  setKPI('kpi-quantity',     totalQty.toLocaleString('id-ID') + ' unit');
  setKPI('kpi-discount',     formatPercent(avgDiscount));
}

/**
 * Helper untuk update teks KPI dengan animasi fade
 * @param {string} id  - element id
 * @param {string} value - nilai baru
 */
function setKPI(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('kpi-value-animating');
  setTimeout(() => {
    el.textContent = value;
    el.classList.remove('kpi-value-animating');
  }, 150);
}

/* ============================================================
   BAGIAN 10: HELPER — Kelompokkan data & destroy chart lama
   ============================================================ */

/**
 * Kelompokkan data berdasarkan field tertentu, jumlahkan valueField.
 * @param {Array}  data
 * @param {string} groupField  - field yang dijadikan kunci grup
 * @param {string} valueField  - field yang dijumlahkan ('revenue', 'quantity', dll.)
 * @returns {{ labels: string[], values: number[] }}
 */
function groupBy(data, groupField, valueField) {
  const map = {};
  data.forEach(d => {
    const key = d[groupField];
    map[key] = (map[key] || 0) + d[valueField];
  });
  const labels = Object.keys(map).sort();
  const values = labels.map(l => map[l]);
  return { labels, values };
}

/**
 * Hancurkan instance chart lama sebelum membuat yang baru.
 * Ini mencegah canvas conflict "Canvas is already in use".
 * @param {string} key  - kunci di objek `charts`
 */
function destroyChart(key) {
  if (charts[key]) {
    charts[key].destroy();
    delete charts[key];
  }
}

/* ============================================================
   BAGIAN 11: CHART — Tren Penjualan Bulanan (Line Chart)
   ============================================================ */

function renderSalesTrend(data) {
  destroyChart('salesTrend');

  // Inisialisasi 12 bulan dengan revenue 0
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];
  const monthlyRevenue = new Array(12).fill(0);
  const monthlyQty     = new Array(12).fill(0);

  data.forEach(d => {
    const monthIndex = new Date(d.date).getMonth(); // 0-11
    monthlyRevenue[monthIndex] += d.revenue;
    monthlyQty[monthIndex]     += d.quantity;
  });

  const ctx = document.getElementById('chart-sales-trend');
  if (!ctx) return;

  charts.salesTrend = new Chart(ctx, {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        {
          label: 'Revenue (Juta Rp)',
          data: monthlyRevenue.map(v => +(v / 1_000_000).toFixed(2)),
          borderColor: COLORS.blueSolid,
          backgroundColor: 'rgba(59, 130, 246, 0.08)',
          borderWidth: 2.5,
          pointBackgroundColor: COLORS.blueSolid,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: true,
          tension: 0.4,
          yAxisID: 'y',
        },
        {
          label: 'Qty Terjual',
          data: monthlyQty,
          borderColor: COLORS.greenSolid,
          backgroundColor: 'rgba(16, 185, 129, 0.0)',
          borderWidth: 2,
          pointBackgroundColor: COLORS.greenSolid,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: false,
          tension: 0.4,
          yAxisID: 'y1',
          borderDash: [5, 4],
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: defaultLegend,
        tooltip: {
          ...defaultTooltip,
          callbacks: {
            label: ctx => {
              if (ctx.datasetIndex === 0) return ' Revenue: Rp ' + ctx.parsed.y.toFixed(2) + ' Jt';
              return ' Qty: ' + ctx.parsed.y + ' unit';
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#9ca3af', font: { size: 11 } },
        },
        y: {
          position: 'left',
          grid: { color: 'rgba(0,0,0,0.04)' },
          ticks: {
            color: '#9ca3af',
            font: { size: 11 },
            callback: v => 'Rp ' + v + ' Jt',
          },
        },
        y1: {
          position: 'right',
          grid: { display: false },
          ticks: {
            color: '#9ca3af',
            font: { size: 11 },
            callback: v => v + ' unit',
          },
        }
      }
    }
  });
}

/* ============================================================
   BAGIAN 12: CHART — Revenue per Region (Doughnut)
   ============================================================ */

function renderRevenueRegion(data) {
  destroyChart('region');

  const { labels, values } = groupBy(data, 'region', 'revenue');

  const ctx = document.getElementById('chart-region');
  if (!ctx) return;

  charts.region = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: PALETTE.slice(0, labels.length),
        borderColor: '#ffffff',
        borderWidth: 3,
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: defaultLegend,
        tooltip: {
          ...defaultTooltip,
          callbacks: {
            label: ctx => ` ${ctx.label}: ${formatRupiah(ctx.parsed)}`,
          }
        }
      }
    }
  });
}

/* ============================================================
   BAGIAN 13: CHART — Revenue per Kategori Produk (Bar Chart)
   ============================================================ */

function renderRevenueCategory(data) {
  destroyChart('category');

  const { labels, values } = groupBy(data, 'product_category', 'revenue');

  const ctx = document.getElementById('chart-category');
  if (!ctx) return;

  charts.category = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Revenue',
        data: values,
        backgroundColor: PALETTE.slice(0, labels.length),
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...defaultTooltip,
          callbacks: {
            label: ctx => ` ${formatRupiah(ctx.parsed.y)}`,
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#9ca3af', font: { size: 11 } },
        },
        y: {
          grid: { color: 'rgba(0,0,0,0.04)' },
          ticks: {
            color: '#9ca3af',
            font: { size: 11 },
            callback: v => formatRupiah(v),
          },
        }
      }
    }
  });
}

/* ============================================================
   BAGIAN 14: CHART — Penjualan per Sales Rep (Horizontal Bar)
   ============================================================ */

function renderSalesRep(data) {
  destroyChart('salesRep');

  const { labels, values } = groupBy(data, 'sales_rep', 'revenue');

  // Urutkan dari tertinggi ke terendah
  const sorted = labels
    .map((l, i) => ({ label: l, value: values[i] }))
    .sort((a, b) => b.value - a.value);

  const ctx = document.getElementById('chart-sales-rep');
  if (!ctx) return;

  charts.salesRep = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map(d => d.label),
      datasets: [{
        label: 'Revenue',
        data: sorted.map(d => d.value),
        backgroundColor: PALETTE.slice(0, sorted.length),
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      indexAxis: 'y', // Horizontal bar
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...defaultTooltip,
          callbacks: {
            label: ctx => ` ${formatRupiah(ctx.parsed.x)}`,
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(0,0,0,0.04)' },
          ticks: {
            color: '#9ca3af',
            font: { size: 10 },
            callback: v => formatRupiah(v),
          },
        },
        y: {
          grid: { display: false },
          ticks: { color: '#374151', font: { size: 12 } },
        }
      }
    }
  });
}

/* ============================================================
   BAGIAN 15: CHART — Distribusi Tipe Pelanggan (Pie Chart)
   ============================================================ */

function renderCustomerType(data) {
  destroyChart('customerType');

  const { labels, values } = groupBy(data, 'customer_type', 'revenue');

  const ctx = document.getElementById('chart-customer-type');
  if (!ctx) return;

  charts.customerType = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: [COLORS.blue, COLORS.purple],
        borderColor: '#ffffff',
        borderWidth: 3,
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: defaultLegend,
        tooltip: {
          ...defaultTooltip,
          callbacks: {
            label: ctx => ` ${ctx.label}: ${formatRupiah(ctx.parsed)}`,
          }
        }
      }
    }
  });
}

/* ============================================================
   BAGIAN 16: CHART — Metode Pembayaran (Doughnut)
   ============================================================ */

function renderPaymentMethod(data) {
  destroyChart('payment');

  const { labels, values } = groupBy(data, 'payment_method', 'revenue');

  const ctx = document.getElementById('chart-payment');
  if (!ctx) return;

  charts.payment = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: [COLORS.green, COLORS.amber, COLORS.cyan, COLORS.pink],
        borderColor: '#ffffff',
        borderWidth: 3,
        hoverOffset: 6,
        cutout: '55%',
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '55%',
      plugins: {
        legend: defaultLegend,
        tooltip: {
          ...defaultTooltip,
          callbacks: {
            label: ctx => ` ${ctx.label}: ${formatRupiah(ctx.parsed)}`,
          }
        }
      }
    }
  });
}

/* ============================================================
   BAGIAN 17: CHART — Saluran Penjualan (Pie Chart)
   ============================================================ */

function renderSalesChannel(data) {
  destroyChart('channel');

  const { labels, values } = groupBy(data, 'sales_channel', 'revenue');

  const ctx = document.getElementById('chart-channel');
  if (!ctx) return;

  charts.channel = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: [COLORS.indigo, COLORS.orange],
        borderColor: '#ffffff',
        borderWidth: 3,
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: defaultLegend,
        tooltip: {
          ...defaultTooltip,
          callbacks: {
            label: ctx => ` ${ctx.label}: ${formatRupiah(ctx.parsed)}`,
          }
        }
      }
    }
  });
}

/* ============================================================
   BAGIAN 18: CHART — Diskon vs Nilai Penjualan (Scatter Plot)
   ============================================================ */

function renderScatter(data) {
  destroyChart('scatter');

  // Siapkan data scatter: x = diskon (%), y = revenue per transaksi (Juta Rp)
  const scatterData = data.map(d => ({
    x: +(d.discount * 100).toFixed(1),
    y: +(d.revenue / 1_000_000).toFixed(2),
    label: d.product_name,
  }));

  const ctx = document.getElementById('chart-scatter');
  if (!ctx) return;

  charts.scatter = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Transaksi',
        data: scatterData,
        backgroundColor: 'rgba(59, 130, 246, 0.55)',
        borderColor: COLORS.blueSolid,
        borderWidth: 1.5,
        pointRadius: 6,
        pointHoverRadius: 8,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...defaultTooltip,
          callbacks: {
            label: ctx => {
              const raw = ctx.raw;
              return [` Diskon: ${raw.x}%`, ` Revenue: Rp ${raw.y} Jt`];
            }
          }
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Diskon (%)',
            color: '#9ca3af',
            font: { size: 11 },
          },
          grid: { color: 'rgba(0,0,0,0.04)' },
          ticks: { color: '#9ca3af', font: { size: 11 }, callback: v => v + '%' },
        },
        y: {
          title: {
            display: true,
            text: 'Revenue (Juta Rp)',
            color: '#9ca3af',
            font: { size: 11 },
          },
          grid: { color: 'rgba(0,0,0,0.04)' },
          ticks: {
            color: '#9ca3af',
            font: { size: 11 },
            callback: v => 'Rp ' + v + ' Jt',
          },
        }
      }
    }
  });
}

/* ============================================================
   BAGIAN 19: CHART — Top 10 Transaksi Tertinggi (Horizontal Bar)
   ============================================================ */

function renderTop10(data) {
  destroyChart('top10');

  // Urutkan semua transaksi berdasarkan revenue, ambil top 10
  const top10 = [...data]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Label: nomor ID transaksi + nama produk (ringkas)
  const labels = top10.map(d => `#${d.id} ${d.product_name.length > 16 ? d.product_name.slice(0,16)+'…' : d.product_name}`);
  const values = top10.map(d => d.revenue);

  const ctx = document.getElementById('chart-top10');
  if (!ctx) return;

  charts.top10 = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Revenue',
        data: values,
        backgroundColor: values.map((_, i) =>
          i === 0 ? COLORS.amber : (i < 3 ? COLORS.blue : 'rgba(99, 102, 241, 0.7)')
        ),
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...defaultTooltip,
          callbacks: {
            label: ctx => ` ${formatRupiah(ctx.parsed.x)}`,
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(0,0,0,0.04)' },
          ticks: {
            color: '#9ca3af',
            font: { size: 10 },
            callback: v => formatRupiah(v),
          },
        },
        y: {
          grid: { display: false },
          ticks: { color: '#374151', font: { size: 10 } },
        }
      }
    }
  });
}

/* ============================================================
   BAGIAN 20: CHART — Kuantitas Terjual per Kategori (Bar)
   ============================================================ */

function renderQtyCategory(data) {
  destroyChart('qtyCategory');

  const { labels, values } = groupBy(data, 'product_category', 'quantity');

  // Urutkan dari tertinggi
  const sorted = labels
    .map((l, i) => ({ label: l, value: values[i] }))
    .sort((a, b) => b.value - a.value);

  const ctx = document.getElementById('chart-qty-category');
  if (!ctx) return;

  charts.qtyCategory = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map(d => d.label),
      datasets: [{
        label: 'Qty Terjual',
        data: sorted.map(d => d.value),
        backgroundColor: sorted.map((_, i) => PALETTE[i % PALETTE.length]),
        borderRadius: 8,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...defaultTooltip,
          callbacks: {
            label: ctx => ` ${ctx.parsed.y.toLocaleString('id-ID')} unit`,
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#374151', font: { size: 12, weight: '500' } },
        },
        y: {
          grid: { color: 'rgba(0,0,0,0.04)' },
          ticks: {
            color: '#9ca3af',
            font: { size: 11 },
            callback: v => v + ' unit',
          },
        }
      }
    }
  });
}

/* ============================================================
   BAGIAN 21: START — Inisialisasi saat DOM siap
   ============================================================ */
document.addEventListener('DOMContentLoaded', initDashboard);
