import { MoveUp, RefreshCw } from "lucide-react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export default function QuickReviewSection() {
  // Generate 30 days of random appointment data
  const generateAppointmentData = () => {
    const data = [];
    const labels = [];
    const today = new Date();
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
      data.push(Math.floor(Math.random() * 21)); // Random number 0-20
    }
    
    return { labels, data };
  };

  const { labels, data } = generateAppointmentData();

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Appointments',
        data: data,
        borderColor: '#F57C3A',
        backgroundColor: 'rgba(13, 100, 107, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#F57C3A',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: true,
        text: '30-Day Appointment Trends',
        font: {
          size: 16,
          weight: 'bold' as const,
        },
        color: '#374151',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 20,
        ticks: {
          stepSize: 5,
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.1)',
        },
      },
      x: {
        grid: {
          display: false,
        },
        ticks: {
          maxRotation: 45,
          minRotation: 45,
        },
      },
    },
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex justify-between items-center border-b border-gray-200 pb-6 mb-6">
            <div className="flex flex-col items-start gap-2">
                <h2 className="text-xl font-medium">Quick Review</h2>
                <span className="text-sm text-gray-500">Track Laine’s impact and scheduling performance</span>
            </div>
            
            <button className="text-[#0D646B] px-4 py-2 rounded-md hover:bg-[#0D646B]/10 transition-all duration-300 flex items-center gap-2 cursor-pointer">
                <RefreshCw className="w-4 h-4" />
                Refresh
            </button>
        </div>
        <div className="flex justify-center w-full p-4">
            <div className="flex flex-col gap-4 w-1/2" id="quick-review-stats">
                <div className="border border-gray-300 rounded-md p-4 flex justify-between items-center w-3/4" id="appointments-booked">
                    <h2 className="text-4xl font-medium text-[#F57C3A]">75</h2>
                    <div className="flex flex-col items-end gap-1">
                        <span className="text-lg font-medium text-[#F57C3A] text-right">Appointments Booked via Laine</span>
                        <span className="text-xs text-gray-500 text-right">Total appointments scheduled through Laine AI</span>
                    </div>
                </div>
                <div className="border border-gray-300 rounded-md p-4 flex justify-between items-center w-3/4" id="appointments-booked">
                    <h2 className="text-3xl font-medium text-[#2E7D32] flex items-center"><MoveUp className="w-6 h-6 text-[#2E7D32] font-bold"/>19%</h2>
                    <div className="flex flex-col items-end gap-1">
                        <span className="text-lg font-medium text-[#2E7D32] text-right">Previous 30 day appointments</span>
                        <span className="text-xs text-gray-500 text-right max-w-4/5">Laine booked 19% more appointments than last 30 days</span>
                    </div>
                </div>
                <div className="border border-gray-300 rounded-md p-4 flex justify-between items-center w-3/4" id="appointments-booked">
                    <h2 className="text-4xl font-medium text-[#F623E62]">3</h2>
                    <div className="flex flex-col items-end gap-2">
                        <span className="text-lg font-medium text-[#F623E62] text-right">Appointment Types Created</span>
                        <span className="text-xs text-gray-500 text-right">Total appointment types configured</span>
                    </div>
                </div>
                <div className="border border-gray-300 rounded-md p-4 flex justify-between items-center w-3/4" id="appointments-booked">
                    <h2 className="text-4xl font-medium text-[#1E88E5]">1</h2>
                    <div className="flex flex-col items-end gap-2">
                        <span className="text-lg font-medium text-[#1E88E5] text-right">Active Providers</span>
                        <span className="text-xs text-gray-500 text-right">Providers available for scheduling</span>
                    </div>
                </div>
            </div>
            <div className="flex flex-col gap-4 w-1/2" id="quick-review-chart">
              <div className="h-9/10">
                <Line data={chartData} options={chartOptions} />
              </div>
            </div>
        </div>
    </div>
  );
}