import { Check, Plus, SquarePen, Trash, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

interface AppointmentType {
  id: string;
  name: string;
  spokenName: string;
  duration: string;
  isBookableOnline: boolean;
  immediateCheck: boolean;
  syncStatus: 'synced' | 'not-synced';
}

export default function AppointmentTypesConfiguration() {
  const [appointments, setAppointments] = useState<AppointmentType[]>([
    {
      id: '1',
      name: 'Limited Exam with X-rays (Problem-Focused)',
      spokenName: 'Focused exam with x-rays',
      duration: '50mins',
      isBookableOnline: true,
      immediateCheck: true,
      syncStatus: 'synced'
    },
    {
      id: '2',
      name: 'Returning Patient Exam & Cleaning (Child, Age 4-12)',
      spokenName: 'Returning child cleaning',
      duration: '60mins',
      isBookableOnline: true,
      immediateCheck: false,
      syncStatus: 'synced'
    },
    {
      id: '3',
      name: 'Teeth Cleaning (Prophylaxis)',
      spokenName: 'Regular teeth cleaning',
      duration: '45mins',
      isBookableOnline: true,
      immediateCheck: true,
      syncStatus: 'not-synced'
    },
    {
      id: '4',
      name: 'Post-Op or Treatment Follow-Up (Recent Visit)',
      spokenName: 'Follow-up appointment',
      duration: '90mins',
      isBookableOnline: false,
      immediateCheck: false,
      syncStatus: 'not-synced'
    }
  ]);

  const [currentPage, setCurrentPage] = useState(1);
  const cardsPerPage = 3;

  const toggleBookableOnline = (id: string) => {
    setAppointments(prev => prev.map(app => 
      app.id === id ? { ...app, isBookableOnline: !app.isBookableOnline } : app
    ));
  };

  const toggleImmediateCheck = (id: string) => {
    setAppointments(prev => prev.map(app => 
      app.id === id ? { ...app, immediateCheck: !app.immediateCheck } : app
    ));
  };

  const getSyncStatusDisplay = (status: AppointmentType['syncStatus']) => {
    switch (status) {
      case 'synced':
        return <span className="px-2 py-1 flex items-center gap-1 bg-[#2E7D32]/10 rounded-full text-sm text-[#2E7D32]"><Check className="w-4 h-4"/> Synced</span>;
      case 'not-synced':
        return <span className="px-2 py-1 flex items-center gap-1 bg-gray-200 rounded-full text-sm text-black/60">Not synced</span>;
    }
  };

  // Pagination logic
  const totalPages = Math.ceil(appointments.length / cardsPerPage);
  const startIndex = (currentPage - 1) * cardsPerPage;
  const endIndex = startIndex + cardsPerPage;
  const currentAppointments = appointments.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex justify-between items-center border-b border-gray-200 pb-6 mb-6">
            <div className="flex flex-col items-start gap-2">
                <h2 className="text-xl font-medium">Appointment Types Configuration</h2>
                <span className="text-sm text-gray-500">Manage appointment types directly in Laine. Changes are automatically synced to NexHealth.</span>
            </div>
            <button className="text-[#0D646B] px-4 py-2 rounded-md hover:bg-[#0D646B]/10 transition-all duration-300 flex items-center gap-2 cursor-pointer">
                <Plus className="w-4 h-4" />
                Add new type
            </button>
        </div>
        <div className="space-y-4">
            {currentAppointments.map((appointment) => (
                <div key={appointment.id} className="flex items-start justify-between gap-4 border border-gray-300 rounded-md p-4">
                    <div className="flex flex-col gap-2 w-1/3">
                        <div className="flex flex-col items-start">
                            <span className="text-sm text-gray-500">Appointment Name:</span>
                            <span className="text-base">{appointment.name}</span>
                        </div>
                        <div className="flex flex-col items-start">
                            <span className="text-sm text-gray-500">Spoken Name:</span>
                            <span className="text-base">{appointment.spokenName}</span>
                        </div>
                        <div className="flex flex-col items-start">
                            <span className="text-sm text-gray-500">Duration</span>
                            <span className="text-base">{appointment.duration}</span>
                        </div>
                    </div>
                    <div className="flex flex-col justify-between gap-2 w-1/3 h-full">
                        <div className="flex items-center justify-between gap-2 w-56">
                            <span className="text-sm text-gray-500">Immediate Check:</span>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => toggleImmediateCheck(appointment.id)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#0D646B] focus:ring-offset-2 ${
                                        appointment.immediateCheck ? 'bg-[#0D646B]' : 'bg-gray-200'
                                    }`}
                                >
                                    <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                            appointment.immediateCheck ? 'translate-x-6' : 'translate-x-1'
                                        }`}
                                    />
                                </button>
                                <span className="text-sm text-gray-700">
                                    {appointment.immediateCheck ? 'Yes' : 'No'}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 w-56">
                            <span className="text-sm text-gray-500">Bookable Online:</span>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => toggleBookableOnline(appointment.id)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#0D646B] focus:ring-offset-2 ${
                                        appointment.isBookableOnline ? 'bg-[#0D646B]' : 'bg-gray-200'
                                    }`}
                                >
                                    <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                            appointment.isBookableOnline ? 'translate-x-6' : 'translate-x-1'
                                        }`}
                                    />
                                </button>
                                <span className="text-sm text-gray-700">
                                    {appointment.isBookableOnline ? 'Yes' : 'No'}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 w-56">
                            <span className="text-sm text-gray-500">Sync Status:</span>
                            {getSyncStatusDisplay(appointment.syncStatus)}
                        </div>
                    </div>
                    <div className="flex flex-col justify-between gap-4 max-w-1/3 h-full">
                        <button
                            className="bg-[#0D646B] flex items-center gap-2 text-white px-6 py-2 rounded-md hover:bg-[#0D646B]/90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                            <SquarePen className="w-4 h-4"/> Update
                        </button>   
                        <button
                            className="bg-[#E53935] flex items-center gap-2 text-white px-6 py-2 rounded-md hover:bg-[#E53935]/90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                            <Trash className="w-4 h-4"/> Delete
                        </button>                    
                    </div>
                </div>
            ))}
        </div>
        
        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-[#0D646B] disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
            
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => goToPage(page)}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    currentPage === page
                      ? 'bg-[#0D646B]/20 text-[#0D646B]'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {page}
                </button>
              ))}
            </div>
            
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-[#0D646B] disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
    </div>
  );
}