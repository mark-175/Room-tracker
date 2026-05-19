import { useMemo } from 'react';
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import type { Room } from '../types';

// chart.js is bundled by Vite (no CDN) so the app stays fully offline, just
// like the old vendored chart.umd.js. Register only the pieces we use.
ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

interface Props {
  rooms: Room[];
}

// Monthly planned-vs-completed bars, bucketed by deadline month — identical
// data + styling to the old updateChart(). react-chartjs-2 handles the
// destroy/recreate the prototype did manually on each render.
export default function CompletionChart({ rooms }: Props) {
  const { completed, planned } = useMemo(() => {
    const completed = new Array(12).fill(0);
    const planned = new Array(12).fill(0);
    rooms.forEach((r) => {
      if (r.deadline) {
        const m = parseInt(r.deadline.split('-')[1], 10) - 1;
        planned[m]++;
        if (r.status === 'Done') completed[m]++;
      }
    });
    return { completed, planned };
  }, [rooms]);

  return (
    <div className="chart-wrap">
      <Bar
        aria-label="Monthly room completion chart"
        data={{
          labels: MONTHS,
          datasets: [
            {
              label: 'Completed',
              data: completed,
              backgroundColor: '#639922',
              borderRadius: 4,
            },
            {
              label: 'Planned',
              data: planned,
              backgroundColor: '#d3d1c7',
              borderRadius: 4,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { mode: 'index', intersect: false },
          },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 11 } } },
            y: {
              beginAtZero: true,
              ticks: { stepSize: 1, font: { size: 11 } },
              grid: { color: 'rgba(128,128,128,0.15)' },
            },
          },
        }}
      />
    </div>
  );
}
