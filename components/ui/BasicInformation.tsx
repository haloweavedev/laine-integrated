"use client";

import { File, FileUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// Types
interface Practice {
  id: string;
  name: string | null;
  practiceNamePronounciation: string | null;
  addressPronunciation: string | null;
  webhookLastSyncAt: string | null;
  address: string | null;
  acceptedInsurances: string | null;
  serviceCostEstimates: string | null;
  nexhealthSubdomain: string | null;
  nexhealthLocationId: string | null;
  appointmentTypes: Array<{
    id: string;
    nexhealthAppointmentTypeId: string;
    name: string;
    duration: number;
    bookableOnline: boolean | null;
    spokenName: string | null;
    check_immediate_next_available: boolean;
    keywords: string | null;
    lastSyncError: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  providers: Array<{
    id: string;
    nexhealthProviderId: string;
    firstName: string | null;
    lastName: string;
  }>;
  savedProviders: Array<{
    id: string;
    providerId: string;
    isActive: boolean;
    provider: {
      id: string;
      nexhealthProviderId: string;
      firstName: string | null;
      lastName: string;
    };
  }>;
  savedOperatories: Array<{
    id: string;
    nexhealthOperatoryId: string;
    name: string;
    isActive: boolean;
  }>;
}

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
}

interface BasicInformationProps {
  practice: Practice | null;
  onUpdate: () => void;
}

export default function BasicInformation({ practice, onUpdate }: BasicInformationProps) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [acceptedInsurancesText, setAcceptedInsurancesText] = useState(practice?.acceptedInsurances || "");
  const [selectedFile, setSelectedFile] = useState<UploadedFile | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [basicInfoLoading, setBasicInfoLoading] = useState(false);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const file = files[0];
    
    // Validate file type
    if (file.type !== 'application/pdf') {
      toast.error('Only PDF files are allowed');
      return;
    }

    // Validate file size (5MB = 5 * 1024 * 1024 bytes)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    // Create object URL for preview
    const fileUrl = URL.createObjectURL(file);

    const newFile: UploadedFile = {
      id: Date.now().toString(),
      name: file.name,
      size: file.size,
      type: file.type,
      url: fileUrl
    };

    setUploadedFiles(prev => [...prev, newFile]);
    
    // Update the text input with the new file name
    const fileNameWithoutExtension = file.name.replace('.pdf', '');
    const currentText = acceptedInsurancesText.trim();
    const newText = currentText 
      ? `${currentText}, ${fileNameWithoutExtension}`
      : fileNameWithoutExtension;
    
    setAcceptedInsurancesText(newText);
    
    // Clear the input
    event.target.value = '';
  };

  const removeFile = (fileId: string) => {
    const fileToRemove = uploadedFiles.find(f => f.id === fileId);
    if (!fileToRemove) return;

    // Clean up object URL if it exists
    if (fileToRemove.url) {
      URL.revokeObjectURL(fileToRemove.url);
    }

    setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
    
    // Remove the file name from the text input
    const fileNameWithoutExtension = fileToRemove.name.replace('.pdf', '');
    const currentText = acceptedInsurancesText;
    const newText = currentText
      .split(',')
      .map(item => item.trim())
      .filter(item => item !== fileNameWithoutExtension)
      .join(', ');
    
    setAcceptedInsurancesText(newText);
  };

  const handleFilePreview = (file: UploadedFile) => {
    setSelectedFile(file);
    setShowPreview(true);
  };

  const closePreview = () => {
    setShowPreview(false);
    setSelectedFile(null);
  };

  const handleBasicInfoSave = async (formData: FormData) => {
    setBasicInfoLoading(true);
    try {
      // Add the current text value to the form data
      formData.set('acceptedInsurances', acceptedInsurancesText);
      
      const response = await fetch('/api/practice-config/basic', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        toast.success('Basic information saved successfully!');
        
        // Refresh data after save
        onUpdate();
      } else {
        const error = await response.json();
        toast.error(`Failed to save: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error saving config:', error);
      toast.error('Failed to save configuration');
    } finally {
      setBasicInfoLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h2 className="text-xl font-medium mb-4">Basic Information</h2>
      <form onSubmit={async (e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        await handleBasicInfoSave(formData);
      }} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="practiceName" className="block text-sm font-medium text-gray-700 mb-1">
              Practice Name (Optional)
            </label>
            <input
              type="text"
              id="practiceName"
              name="practiceName"
              defaultValue={practice?.name || ""}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#0D646B]"
              placeholder="Bright Smile Dental"
            />
          </div>
          
          <div>
            <label htmlFor="practiceNamePronounciation" className="block text-sm font-medium text-gray-700 mb-1">
              Practice Name (pronunciation guide)
            </label>
            <input
              type="text"
              id="practiceNamePronounciation"
              name="practiceNamePronounciation"
              defaultValue={practice?.practiceNamePronounciation || ""}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#0D646B]"
              placeholder="e.g., brayt smayl den-tuhl"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="practiceAddress" className="block text-sm font-medium text-gray-700 mb-1">
              Practice Address
            </label>
            <input
              type="text"
              id="practiceAddress"
              name="practiceAddress"
              defaultValue={practice?.address || ""}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#0D646B]"
              placeholder="e.g., 123 Dental St, Smileytown, CA 98765"
            />
          </div>

          <div>
            <label htmlFor="practiceAddressPronunciation" className="block text-sm font-medium text-gray-700 mb-1">
              Practice Address (pronunciation guide)
            </label>
            <input
              type="text"
              id="practiceAddressPronunciation"
              name="practiceAddressPronunciation"
              defaultValue={practice?.addressPronunciation || ""}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#0D646B]"
              placeholder="e.g., one two three dental street, smiley town, c a nine eight seven six five"
            />
          </div>
        </div>

        <div>
          <label htmlFor="acceptedInsurances" className="block text-sm font-medium text-gray-700">
            Accepted Insurances 
          </label>
          <span className="text-xs text-gray-500 mb-1">Supported file types: PDF (5mb max)</span>
          {/* Custom input with file upload button */}
          <div className="relative">
            <input
              type="text"
              id="acceptedInsurances"
              name="acceptedInsurances"
              value={acceptedInsurancesText}
              onChange={(e) => setAcceptedInsurancesText(e.target.value)}
              className="w-full px-3 py-2 pr-32 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#0D646B]"
              placeholder="Cigna, Delta Dental, etc."
              disabled
            />
            <div className="absolute inset-y-0 right-1 flex items-center">
              <label
                htmlFor="file-upload"
                className="cursor-pointer bg-white border-l border-gray-300 px-3 py-2 text-sm font-medium flex items-center gap-1"
                style={{
                  color: "#0D646B",
                }}
                onMouseOver={e => (e.currentTarget.style.opacity = ".8")}
                onMouseOut={e => (e.currentTarget.style.color = "#0D646B")}
              >
                <FileUp className="w-4 h-4" />
                File Upload
              </label>
              <input
                id="file-upload"
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
          </div>

          {/* Uploaded Files Section */}
          {uploadedFiles.length > 0 && (
            <div className="mt-3">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Uploaded Files</h4>
              <div className="space-y-2">
                {uploadedFiles.map((file) => (
                  <div key={file.id} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-md">
                    <div 
                      className="flex items-center gap-2 cursor-pointer hover:text-blue-600 flex-1"
                      onClick={() => handleFilePreview(file)}
                    >
                      <File className="w-4 h-4 text-black/60" />
                      <span className="text-sm text-gray-700 hover:text-blue-600">{file.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(file.id)}
                      className="text-gray-400 hover:text-red-500 ml-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* File Preview Modal */}
          {showPreview && selectedFile && (
            <div className="fixed inset-0 bg-black/60 bg-opacity-50 backdrop-blur-xs flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b">
                  <h3 className="text-lg font-semibold text-gray-900">{selectedFile.name}</h3>
                  <button
                    onClick={closePreview}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="flex-1 p-4 overflow-hidden">
                  {selectedFile.url && (
                    <iframe
                      src={selectedFile.url}
                      className="w-full h-full min-h-[60vh] border-0"
                      title={selectedFile.name}
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="serviceCostEstimates" className="block text-sm font-medium text-gray-700 mb-1">
            Service Cost Estimates (comma-separated &apos;Service: $Cost&apos;)
          </label>
          <input
            type="text"
            id="serviceCostEstimates"
            name="serviceCostEstimates"
            defaultValue={practice?.serviceCostEstimates || ""}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#0D646B]"
            placeholder="e.g., Cleaning: $120, Exam: $80, X-Ray: $50"
          />
        </div>
        
        <div className="flex justify-between items-center">
          <button
            type="submit"
            disabled={basicInfoLoading}
            className="bg-[#0D646B] text-white px-6 py-2 rounded-md hover:bg-[#0D646B]/90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {basicInfoLoading ? 'Saving...' : 'Save Basic Information'}
          </button>
        </div>
      </form>
    </div>
  );
}