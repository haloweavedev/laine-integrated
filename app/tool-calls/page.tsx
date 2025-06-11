import { promises as fs } from 'fs';
import path from 'path';
import { Metadata } from 'next';

// Simple markdown-to-HTML converter
function markdownToHtml(markdown: string): string {
  return markdown
    // Headers
    .replace(/^# (.*$)/gm, '<h1 class="text-3xl font-bold mb-6 text-gray-900">$1</h1>')
    .replace(/^## (.*$)/gm, '<h2 class="text-2xl font-semibold mb-4 mt-8 text-gray-800">$1</h2>')
    .replace(/^### (.*$)/gm, '<h3 class="text-xl font-semibold mb-3 mt-6 text-gray-700">$1</h3>')
    .replace(/^#### (.*$)/gm, '<h4 class="text-lg font-semibold mb-2 mt-4 text-gray-600">$1</h4>')
    
    // Code blocks
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-gray-100 rounded-lg p-4 mb-4 overflow-x-auto"><code class="text-sm">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-2 py-1 rounded text-sm font-mono">$1</code>')
    
    // Lists
    .replace(/^- (.*$)/gm, '<li class="mb-1">$1</li>')
    .replace(/(<li.*<\/li>\n?)+/g, '<ul class="list-disc pl-6 mb-4">$&</ul>')
    .replace(/^\d+\. (.*$)/gm, '<li class="mb-1">$1</li>')
    
    // Bold and italic
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold">$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em class="italic">$1</em>')
    
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-600 hover:text-blue-800 underline">$1</a>')
    
    // Blockquotes (for the message examples)
    .replace(/^> (.*$)/gm, '<blockquote class="border-l-4 border-blue-500 pl-4 py-2 mb-4 bg-blue-50 italic text-gray-700">$1</blockquote>')
    
    // Horizontal rules
    .replace(/^---$/gm, '<hr class="my-8 border-gray-300">')
    
    // Paragraphs
    .replace(/\n\n/g, '</p><p class="mb-4">')
    .replace(/^(.+)$/gm, '<p class="mb-4">$1</p>')
    
    // Clean up empty paragraphs and fix nested HTML
    .replace(/<p class="mb-4"><\/p>/g, '')
    .replace(/<p class="mb-4">(<h[1-6])/g, '$1')
    .replace(/(<\/h[1-6]>)<\/p>/g, '$1')
    .replace(/<p class="mb-4">(<ul|<ol|<pre|<blockquote|<hr)/g, '$1')
    .replace(/(<\/ul>|<\/ol>|<\/pre>|<\/blockquote>|<hr[^>]*>)<\/p>/g, '$1');
}

export const metadata: Metadata = {
  title: 'Tool Calls System - LAINE Documentation',
  description: 'Comprehensive documentation of the LAINE AI Assistant tool call system and API integration',
};

export default async function ToolCallsPage() {
  try {
    const filePath = path.join(process.cwd(), 'docs', 'tool-calls-system.md');
    const fileContent = await fs.readFile(filePath, 'utf8');
    const htmlContent = markdownToHtml(fileContent);

    return (
      <div className="min-h-screen bg-white">
        <div className="max-w-4xl mx-auto px-6 py-12">
          {/* Header */}
          <div className="mb-8 border-b border-gray-200 pb-6">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              Tool Calls System Documentation
            </h1>
            <p className="text-gray-600 text-lg">
              Technical overview of the LAINE AI Assistant tool call architecture, API integration, and workflow management
            </p>
          </div>

          {/* Table of Contents */}
          <div className="mb-12 bg-gray-50 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Quick Navigation</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <h3 className="font-semibold text-gray-700 mb-2">Core System</h3>
                <ul className="space-y-1 text-gray-600">
                  <li><a href="#webhook-handler-apivapitool-calls" className="hover:text-blue-600">• Webhook Handler</a></li>
                  <li><a href="#tool-system-architecture" className="hover:text-blue-600">• Tool Architecture</a></li>
                  <li><a href="#integration-features" className="hover:text-blue-600">• Integration Features</a></li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-gray-700 mb-2">Tool Categories</h3>
                <ul className="space-y-1 text-gray-600">
                  <li><a href="#1-patient-management-tools" className="hover:text-blue-600">• Patient Management</a></li>
                  <li><a href="#2-appointment-discovery-tools" className="hover:text-blue-600">• Appointment Discovery</a></li>
                  <li><a href="#3-financial-tools" className="hover:text-blue-600">• Financial Tools</a></li>
                  <li><a href="#4-booking--information-tools" className="hover:text-blue-600">• Booking & Information</a></li>
                </ul>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div 
            className="prose prose-lg max-w-none"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />

          {/* Footer */}
          <div className="mt-16 pt-8 border-t border-gray-200">
            <div className="bg-blue-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-blue-900 mb-2">
                System Status
              </h3>
              <p className="text-blue-800 mb-3">
                The LAINE tool call system is currently in production with full NexHealth integration.
              </p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <strong className="text-blue-900">Active Tools:</strong> 8/8
                </div>
                <div>
                  <strong className="text-blue-900">Current Phase:</strong> 1.4 (Universal Dynamic Messages)
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error('Error reading markdown file:', error);
    
    return (
      <div className="min-h-screen bg-white">
        <div className="max-w-4xl mx-auto px-6 py-12">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              Tool Calls Documentation
            </h1>
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <p className="text-red-800">
                Error loading documentation. Please ensure the markdown file exists at docs/tool-calls-system.md
              </p>
            </div>
          </div>
        </div>
      </div>        
    );
  }
} 