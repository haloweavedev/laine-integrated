import { Circle, RefreshCw, Settings, ChevronLeft, ChevronRight} from "lucide-react";
import { useState } from "react";

interface Provider {
    id: string;
    name: string;
    status: 'active' | 'inactive';
    linkedOperatories: string;
}

export default function ProvidersConfiguration() {
    const [providers, setProviders] = useState<Provider[]>([
        {
            id: '1',
            name: 'Holly Perkins',
            status: 'active',
            linkedOperatories: 'Op 1 (Hygiene), Op 3 (General)'
        },
        {
            id: '2',
            name: 'Dr. Sarah Johnson',
            status: 'active',
            linkedOperatories: 'Op 2 (General), Op 4 (Surgery)'
        },
        {
            id: '3',
            name: 'Dr. Michael Chen',
            status: 'inactive',
            linkedOperatories: 'Op 1 (General), Op 5 (Orthodontics)'
        },
        {
            id: '4',
            name: 'Dr. Emily Rodriguez',
            status: 'active',
            linkedOperatories: 'Op 3 (Hygiene), Op 6 (Pediatrics)'
        },
        {
            id: '5',
            name: 'Dr. James Wilson',
            status: 'inactive',
            linkedOperatories: 'Op 2 (Surgery), Op 4 (General)'
        },
        {
            id: '6',
            name: 'Dr. Lisa Thompson',
            status: 'active',
            linkedOperatories: 'Op 1 (Orthodontics), Op 5 (Hygiene)'
        }
    ]);

    const [currentPage, setCurrentPage] = useState(1);
    const cardsPerPage = 4;

    // Pagination logic
    const totalPages = Math.ceil(providers.length / cardsPerPage);
    const startIndex = (currentPage - 1) * cardsPerPage;
    const endIndex = startIndex + cardsPerPage;
    const currentProviders = providers.slice(startIndex, endIndex);

    const goToPage = (page: number) => {
        setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    };

    const getStatusDisplay = (status: Provider['status']) => {
        switch (status) {
            case 'active':
                return <span className="px-2 py-1 flex items-center gap-1 bg-[#2E7D32]/10 rounded-full text-sm text-[#2E7D32]"><Circle fill="#04c350" stroke="#04c350" className="w-2 h-2"/> Active in Laine</span>;
            case 'inactive':
                return <span className="px-2 py-1 flex items-center gap-1 bg-gray-200 rounded-full text-sm text-black/60">Inactive</span>;
        }
    };

    return (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex justify-between items-center border-b border-gray-200 pb-6 mb-6">
                <div className="flex flex-col items-start gap-2">
                    <h2 className="text-xl font-medium">Providers Configurationn</h2>
                    <span className="text-sm text-gray-500">Manage appointment types directly in Laine. Changes are automatically synced to NexHealth.</span>
                </div>
                <button className="text-[#0D646B] px-4 py-2 rounded-md hover:bg-[#0D646B]/10 transition-all duration-300 flex items-center gap-2 cursor-pointer">
                <RefreshCw className="w-4 h-4" />
                    Sync Provider data
                </button>
            </div>
            <div className="space-y-4">
                {currentProviders.map((provider) => (
                    <div key={provider.id} className="flex items-start justify-between gap-4 border border-gray-300 rounded-md p-4">
                        <div className="flex flex-col gap-2 w-1/3">
                            <div className="flex items-start gap-2">
                                <span className="text-lg font-medium">{provider.name}</span>
                                {getStatusDisplay(provider.status)}
                            </div>
                        </div>
                        <div className="flex flex-col justify-between gap-2 w-1/3 h-full">
                            <div className="flex flex-col items-start">
                                <span className="text-sm text-gray-500">Linked Operatories / Columns:</span>
                                <span className="text-base">{provider.linkedOperatories}</span>
                            </div>
                        </div>
                        <div className="flex flex-col justify-between gap-4 max-w-1/3 h-full">
                            <button
                                className="bg-[#0D646B] flex items-center gap-2 text-white px-6 py-2 rounded-md hover:bg-[#0D646B]/90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                            >
                                <Settings className="w-4 h-4"/> Configure
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
    )
}