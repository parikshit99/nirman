import React, { useState, useRef, useEffect } from 'react';
import { 
  Mic,
  MicOff,
  Plus, 
  Upload, 
  FileText, 
  Image as ImageIcon, 
  ClipboardCheck, 
  Loader2, 
  Trash2, 
  Download, 
  HardHat,
  ChevronRight,
  Search,
  IndianRupee,
  Calendar,
  Truck,
  ArrowRight,
  History,
  AlertCircle,
  Database,
  Calculator,
  LayoutDashboard,
  Save,
  FileCode,
  Eye,
  TrendingUp,
  Check,
  Zap,
  AlertTriangle,
  Info,
  Copy,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { extractMaterialData, ExtractedMaterial } from './lib/gemini.ts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Fuse from 'fuse.js';

type AppTab = 'auditor' | 'boq' | 'history' | 'database';

interface HistoryRecord {
  id: string;
  timestamp: string;
  title: string;
  items: (ExtractedMaterial & { id: string })[];
  notes: string;
  address?: string;
  category?: string; // allow any string category
  siteDate?: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('auditor');
  const [dbSubTab, setDbSubTab] = useState<'materials' | 'indexed' | 'categories'>('materials');
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [auditLog, setAuditLog] = useState<(ExtractedMaterial & { id: string })[]>([]);
  const [boqItems, setBoqItems] = useState<(ExtractedMaterial & { id: string })[]>([]);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [generalNotes, setGeneralNotes] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<Partial<ExtractedMaterial>>({});
  const [dragActive, setDragActive] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isHistoryEditMode, setIsHistoryEditMode] = useState(false);
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
  const [pushedRates, setPushedRates] = useState<Record<string, { date: string, price: number, vendor: string, indexedAt?: string }[]>>(() => {
    const saved = localStorage.getItem('nirmaan_pushed_rates');
    return saved ? JSON.parse(saved) : {};
  });

  const [workCategories, setWorkCategories] = useState<string[]>(() => {
    const saved = localStorage.getItem('nirmaan_work_categories');
    return saved ? JSON.parse(saved) : ['Civil', 'Electrical', 'Plumbing', 'Carpenter', 'Hvac', 'Tile', 'Stone', 'Other'];
  });

  useEffect(() => {
    localStorage.setItem('nirmaan_pushed_rates', JSON.stringify(pushedRates));
  }, [pushedRates]);

  useEffect(() => {
    localStorage.setItem('nirmaan_work_categories', JSON.stringify(workCategories));
  }, [workCategories]);
  
  const [saveMetadata, setSaveMetadata] = useState({
    title: '',
    address: '',
    category: 'Civil', // Drop strict typing to allow custom categories
    date: new Date().toISOString().split('T')[0]
  });
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Persistence: Load from LocalStorage
  useEffect(() => {
    const savedAudit = localStorage.getItem('nirmaan_local_audit_log');
    const savedBoq = localStorage.getItem('nirmaan_local_boq_log');
    const savedNotes = localStorage.getItem('nirmaan_local_boq_notes');
    const savedHistory = localStorage.getItem('nirmaan_local_history');
    if (savedAudit) {
      try { setAuditLog(JSON.parse(savedAudit)); } catch (e) { console.error(e); }
    }
    if (savedBoq) {
      try { setBoqItems(JSON.parse(savedBoq)); } catch (e) { console.error(e); }
    }
    if (savedNotes) {
      setGeneralNotes(savedNotes);
    }
    if (savedHistory) {
      try { setHistory(JSON.parse(savedHistory)); } catch (e) { console.error(e); }
    }
  }, []);

  const saveAudit = (logs: (ExtractedMaterial & { id: string })[]) => {
    localStorage.setItem('nirmaan_local_audit_log', JSON.stringify(logs));
  };

  const saveBoq = (logs: (ExtractedMaterial & { id: string })[]) => {
    localStorage.setItem('nirmaan_local_boq_log', JSON.stringify(logs));
  };

  const saveHistory = (recs: HistoryRecord[]) => {
    setHistory(recs);
    localStorage.setItem('nirmaan_local_history', JSON.stringify(recs));
  };

  const saveNotes = (notes: string) => {
    setGeneralNotes(notes);
    localStorage.setItem('nirmaan_local_boq_notes', notes);
  };

  const addDebug = (msg: string) => {
    setDebugLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 5));
  };

  const toggleListening = () => {
    if (isListening) {
       recognitionRef.current?.stop();
       setIsListening(false);
       addDebug("Speech recognition stopped.");
       return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser/device.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-IN'; // Set to English (India) for generic support

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        setInputText(prev => prev + (prev ? ' ' : '') + finalTranscript);
      }
    };

    recognition.onerror = (event: any) => {
      console.error(event.error);
      setIsListening(false);
      addDebug(`Speech error: ${event.error}`);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    addDebug("Listening for speech...");
  };
  const handleFiles = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const imageFiles = fileArray.filter(f => f.type.startsWith('image/'));
    
    if (selectedImages.length + imageFiles.length > 5) {
      alert("You can upload a maximum of 5 images at once.");
      return;
    }

    imageFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDim = 1200;
          
          if (width > height && width > maxDim) {
            height = (height * maxDim) / width;
            width = maxDim;
          } else if (height > maxDim) {
            width = (width * maxDim) / height;
            height = maxDim;
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          const compressed = canvas.toDataURL('image/jpeg', 0.8);
          setSelectedImages(prev => [...prev, compressed]);
          addDebug(`Image optimized (${Math.round(width)}x${Math.round(height)})`);
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
    addDebug("Image removed.");
  };

  const handleProcess = async () => {
    if (!inputText && selectedImages.length === 0) return;

    setIsProcessing(true);
    setProgress(5);
    setStatusMessage('Waking AI Auditor...');
    setDebugLog([]);
    addDebug(`Starting ${activeTab === 'auditor' ? 'Audit' : 'BOQ'} extraction...`);
    
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev < 30) return prev + 4;
        if (prev < 75) return prev + 1.5;
        if (prev < 98) return prev + 0.3;
        return prev;
      });
    }, 200);

    try {
      const hasImages = selectedImages.length > 0;
      addDebug(hasImages ? `Encoding ${selectedImages.length} images...` : "Sanitizing text input...");
      setStatusMessage(hasImages ? `Reading ${selectedImages.length} document pages...` : 'Analyzing text...');
      
      const imgBase64s = selectedImages.map(img => img.split(',')[1]);
      const learning = JSON.parse(localStorage.getItem('nirmaan_learning_v1') || '{}');
      
      addDebug("Connecting to AI Auditor (Flash-3)...");
      
      const timeoutIdRef = { id: null as any };
      const timeoutPromise = new Promise((_, reject) => {
        timeoutIdRef.id = setTimeout(() => {
          reject(new Error("AI Connection Timeout (60s) - Please check your network or try a smaller photo."));
        }, 60000);
      });

      console.log("Starting extractMaterialData call with", imgBase64s.length, "images");
      
      const rawResults = await Promise.race([
        extractMaterialData(inputText, imgBase64s, learning, saveMetadata.category),
        timeoutPromise
      ]);
      
      clearTimeout(timeoutIdRef.id);
      const results = rawResults as ExtractedMaterial[];

      if (!results || !Array.isArray(results)) {
        throw new Error("AI returned invalid format. Please try again.");
      }
      
      if (results.length === 0) {
        throw new Error("No items detected. Ensure text is clear and readable.");
      }

      addDebug(`Audit Complete: ${results.length} items extracted.`);
      
      setStatusMessage('Finalizing Audit...');
      setProgress(95);

      const newEntries = results.map(res => {
        const quantity = Number(res.quantity) || 0;
        const unitPrice = Number(res.unit_price) || 0;
        const total = res.total_amount || (quantity * unitPrice);
        
        return {
          ...res,
          quantity,
          unit_price: unitPrice,
          total_amount: total,
          id: Math.random().toString(36).substr(2, 9),
          createdAt: new Date().toISOString()
        };
      });

      if (activeTab === 'auditor') {
        const updated = [...newEntries, ...auditLog];
        setAuditLog(updated);
        saveAudit(updated);
      } else {
        const updated = [...newEntries, ...boqItems];
        setBoqItems(updated);
        saveBoq(updated);
      }
      
      clearInterval(progressInterval);
      setProgress(100);
      setStatusMessage('Audit Complete!');
      addDebug("Entries stored in device memory.");
      
      setTimeout(() => {
        setInputText('');
        setSelectedImages([]);
        setIsProcessing(false);
        setProgress(0);
        setStatusMessage('');
      }, 800);
      
    } catch (error) {
      clearInterval(progressInterval);
      const errorMsg = error instanceof Error ? error.message : 'Unknown';
      setStatusMessage('Error');
      addDebug(`Trace: ${errorMsg}`);
      alert(`System Error: ${errorMsg}\n\nPlease try again or use a clearer photo.`);
      setIsProcessing(false);
      setProgress(0);
      setStatusMessage('');
    }
  };

  const clearLearning = () => {
    localStorage.removeItem('nirmaan_learning_v1');
    setLearningCounter(c => c + 1);
    addDebug("All learned patterns and corrections cleared.");
    alert("AI knowledge reset to defaults.");
  };

  const startEditing = (item: ExtractedMaterial & { id: string }) => {
    setEditingId(item.id);
    setEditingItem({ ...item });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingItem({});
  };

  const saveEdit = () => {
    if (!editingId) return;
    addDebug("Updating record and learning from correction...");
    const currentList = activeTab === 'auditor' ? auditLog : boqItems;
    const originalItem = currentList.find(i => i.id === editingId);
    
    if (originalItem) {
      const fallbackTerm = originalItem.original_term || originalItem.item_name;
      if (fallbackTerm) {
        const learning = JSON.parse(localStorage.getItem('nirmaan_learning_v1') || '{}');
        const term = fallbackTerm.toLowerCase().trim();
        
        // Learn interpretation mapping
        if (editingItem.item_name !== originalItem.item_name || editingItem.unit !== originalItem.unit) {
          learning[term] = {
            item_name: editingItem.item_name,
            unit: editingItem.unit
          };
          localStorage.setItem('nirmaan_learning_v1', JSON.stringify(learning));
          setLearningCounter(c => c + 1);
          addDebug(`Correction learned for: "${term}" → "${editingItem.item_name}"`);
        }
      }
    }

    const updated = currentList.map(item => {
      if (item.id === editingId) {
        const newItem = { ...item, ...editingItem };
        const q = Number(newItem.quantity) || 0;
        const p = Number(newItem.unit_price) || 0;
        newItem.total_amount = q * p;
        return newItem as ExtractedMaterial & { id: string };
      }
      return item;
    });

    if (activeTab === 'auditor') {
      setAuditLog(updated);
      saveAudit(updated);
    } else {
      setBoqItems(updated);
      saveBoq(updated);
    }
    setEditingId(null);
    setEditingItem({});
    addDebug("Record updated successfully.");
  };

  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);

  const saveToHistory = () => {
    const currentItems = activeTab === 'auditor' ? auditLog : boqItems;
    if (currentItems.length === 0) return;
    
    if (activeHistoryId) {
      // Find the record to populate metadata for editing
      const record = history.find(r => r.id === activeHistoryId);
      setIsHistoryEditMode(true);
      setEditingHistoryId(activeHistoryId);
      setSaveMetadata({
        title: record?.title || 'BOQ',
        address: record?.address || '',
        category: record?.category || 'Civil',
        date: new Date().toISOString().split('T')[0]
      });
    } else {
      setIsHistoryEditMode(false);
      setSaveMetadata({
        title: 'BOQ',
        address: '',
        category: guessCategory(currentItems),
        date: new Date().toISOString().split('T')[0]
      });
    }
    setIsSaveModalOpen(true);
  };

  const editHistoryMetadata = (record: HistoryRecord) => {
    setIsHistoryEditMode(true);
    setEditingHistoryId(record.id);
    setSaveMetadata({
      title: record.title,
      address: record.address || '',
      category: record.category || 'Civil',
      date: record.siteDate || record.timestamp.split('T')[0]
    });
    setIsSaveModalOpen(true);
  };

  const confirmSaveToHistory = (forceNew: boolean = false) => {
    // Generate a default title if none is set
    const autoTitle = `BOQ ${saveMetadata.date.split('-').reverse().join('/')}`;
    const finalTitle = saveMetadata.title.trim() || autoTitle;

    if (isHistoryEditMode && editingHistoryId && !forceNew) {
      const updated = history.map(r => r.id === editingHistoryId ? { 
        ...r, 
        title: finalTitle,
        items: activeTab === 'boq' ? [...boqItems] : [...auditLog], // Allow updating items too
        notes: activeTab === 'auditor' ? (r.notes || '') : generalNotes,
        address: saveMetadata.address.trim(),
        category: saveMetadata.category,
        siteDate: saveMetadata.date
      } : r);
      saveHistory(updated);
      addDebug("History record updated.");
    } else {
      const currentItems = activeTab === 'auditor' ? auditLog : boqItems;
      const newRecord: HistoryRecord = {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toISOString(),
        title: finalTitle,
        items: [...currentItems],
        notes: activeTab === 'auditor' ? '' : generalNotes,
        address: saveMetadata.address.trim(),
        category: saveMetadata.category,
        siteDate: saveMetadata.date
      };

      const updated = [newRecord, ...history];
      saveHistory(updated);
      // If we saved as new from an existing, we don't necessarily want to link to it 
      // unless the user keeps working on it.
      if (!forceNew) {
        setActiveHistoryId(newRecord.id);
      }
      addDebug("Session saved to history.");
    }
    setIsSaveModalOpen(false);
    setEditingHistoryId(null);
  };

  const renameHistoryRecord = (id: string, currentTitle: string) => {
    const newTitle = prompt("Edit Title:", currentTitle);
    if (!newTitle) return;
    const updated = history.map(r => r.id === id ? { ...r, title: newTitle } : r);
    saveHistory(updated);
    addDebug("History record renamed.");
  };

  const loadFromHistory = (record: HistoryRecord) => {
    addDebug(`Restoring session: ${record.id}`);
    if (boqItems.length > 0) {
      const confirm = window.confirm("Overwrite current BOQ draft with this record?");
      if (!confirm) return;
    }
    
    // Direct updates
    setBoqItems([...record.items]);
    saveBoq([...record.items]);
    setGeneralNotes(record.notes || "");
    saveNotes(record.notes || "");
    setActiveTab('boq');
    setActiveHistoryId(record.id);
    addDebug(`Restored: ${record.title}`);
  };

  const deleteHistoryRecord = (id: string) => {
    const updated = history.filter(r => r.id !== id);
    saveHistory(updated);
    addDebug("History record deleted.");
  };

  const generatePDF = (preview: boolean = false) => {
    addDebug(preview ? "Preparing PDF Preview..." : "Generating BOQ PDF for Download...");
    const currentItems = activeTab === 'auditor' ? auditLog : boqItems;
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(255, 122, 0); // Primary color
    doc.text(activeTab === 'auditor' ? 'AUDIT REPORT' : 'BILL OF QUANTITIES', 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated by Nirmaan AI - ${new Date().toLocaleDateString()}`, 14, 28);
    doc.text(activeTab === 'auditor' ? 'Detailed purchase audit from site receipts/notes.' : 'Material inventory and price estimation report.', 14, 33);
    
    const includesVendor = activeTab === 'auditor';
    
    const tableData = currentItems.map((item, index) => {
      const row = [
        index + 1,
        item.item_name,
        item.quantity,
        item.unit,
        activeTab === 'auditor' ? `Rs. ${item.unit_price?.toLocaleString('en-IN') || '0'}` : "",
        activeTab === 'auditor' ? `Rs. ${(item.total_amount || 0).toLocaleString('en-IN')}` : "",
      ];
      if (includesVendor) row.push(item.vendor || '-');
      return row;
    });

    const headCols = ['Sr.', 'Description', 'Qty', 'Unit', 'Rate', 'Total'];
    if (includesVendor) headCols.push('Vendor');

    const colStyles: any = {
      0: { cellWidth: 10 },
      1: { cellWidth: 'auto' },
      2: { halign: 'center', cellWidth: 20 },
      3: { halign: 'center', cellWidth: 20 },
      4: { halign: 'right', cellWidth: 30 },
      5: { halign: 'right', cellWidth: 35 }
    };
    if (includesVendor) {
      colStyles[2] = { halign: 'center', cellWidth: 15 };
      colStyles[3] = { halign: 'center', cellWidth: 15 };
      colStyles[4] = { halign: 'right', cellWidth: 25 };
      colStyles[5] = { halign: 'right', cellWidth: 30 };
      colStyles[6] = { halign: 'right', cellWidth: 25 };
    }

    autoTable(doc, {
      head: [headCols],
      body: tableData,
      startY: 40,
      theme: 'grid',
      headStyles: { fillColor: [18, 18, 18], textColor: [255, 255, 255] },
      columnStyles: colStyles
    });

    let currentY = (doc as any).lastAutoTable.finalY + 10;
    
    // Add General Notes
    if (activeTab === 'boq' && generalNotes) {
      doc.setFontSize(10);
      doc.setTextColor(0);
      doc.setFont('helvetica', 'bold');
      doc.text('Specifications / Notes:', 14, currentY);
      currentY += 6;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60);
      const splitNotes = doc.splitTextToSize(generalNotes, 180);
      doc.text(splitNotes, 14, currentY);
      currentY += (splitNotes.length * 5) + 10;
    }

    doc.setFontSize(10);
    doc.setTextColor(150);
    doc.setFont('helvetica', 'italic');
    doc.text('Note: Rate and Total columns are intentionally left blank for manual estimation or vendor quotes.', 14, currentY);

    if (preview) {
      setIsPreviewOpen(true);
      addDebug("Visual Preview generated.");
    } else {
      doc.save(`BOQ_${new Date().getTime()}.pdf`);
      addDebug("BOQ PDF Generated.");
    }
  };

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [learningCounter, setLearningCounter] = useState(0);

  const clearAll = () => {
    addDebug(`Clearing all ${activeTab} records...`);
    if (activeTab === 'auditor') {
      setAuditLog([]);
      saveAudit([]);
    } else if (activeTab === 'boq') {
      setBoqItems([]);
      saveBoq([]);
      setActiveHistoryId(null);
    } else if (activeTab === 'history') {
      setHistory([]);
      saveHistory([]);
      setActiveHistoryId(null);
    }
    setShowClearConfirm(false);
    addDebug("Database reset.");
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [addressFilter, setAddressFilter] = useState<string>('All');

  // Database Indexing Logic
  const itemDatabase = React.useMemo(() => {
    const db: Record<string, {
      name: string;
      unit: string;
      vendors: Set<string>;
      categories: Set<string>;
      addresses: Set<string>;
      priceHistory: { date: string; price: number; vendor: string; timestamp: string }[];
    }> = {};

    let userLearning: Record<string, { item_name: string, unit: string }> = {};
    try {
      userLearning = JSON.parse(localStorage.getItem('nirmaan_learning_v1') || '{}');
    } catch { }

    // Process History
    history.forEach(session => {
      session.items.forEach(rawItem => {
        if (!rawItem.item_name) return;
        
        let item_name = rawItem.item_name;
        let unit = rawItem.unit || 'unit';
        
        const term = (rawItem.original_term || rawItem.item_name)?.toLowerCase().trim();
        if (term && userLearning[term]) {
           item_name = userLearning[term].item_name;
           unit = userLearning[term].unit;
        }

        const key = `${item_name.toLowerCase().trim()}_${unit.toLowerCase().trim()}`;
        if (!db[key]) {
          db[key] = {
            name: item_name,
            unit: unit,
            vendors: new Set(),
            categories: new Set(),
            addresses: new Set(),
            priceHistory: []
          };
        }
        if (rawItem.vendor) db[key].vendors.add(rawItem.vendor);
        if (session.category) db[key].categories.add(session.category);
        if (session.address) db[key].addresses.add(session.address);
        
        if (typeof rawItem.unit_price === 'number') {
          db[key].priceHistory.push({
            date: rawItem.date || session.timestamp.split('T')[0],
            price: rawItem.unit_price,
            vendor: rawItem.vendor || 'Unknown',
            timestamp: session.timestamp // Use exact session timestamp
          });
        }
      });
    });
    
    // Process Pushed Rates (Manual Indexing)
    Object.keys(pushedRates).forEach(key => {
      const rates = pushedRates[key];
      const [name, unit] = key.split('_');
      if (!db[key]) {
        db[key] = {
          name: name || 'Unknown',
          unit: unit || 'unit',
          vendors: new Set(),
          categories: new Set(),
          addresses: new Set(),
          priceHistory: []
        };
      }
      rates.forEach(r => {
        const rName = name || 'Unknown';
        const rUnit = unit || 'unit';
        const term = rName.toLowerCase().trim();
        let targetKey = key;
        
        if (term && userLearning[term]) {
           const learnedName = userLearning[term].item_name;
           const learnedUnit = userLearning[term].unit;
           targetKey = `${learnedName.toLowerCase().trim()}_${learnedUnit.toLowerCase().trim()}`;
           if (!db[targetKey]) {
             db[targetKey] = {
               name: learnedName,
               unit: learnedUnit,
               vendors: new Set(),
               categories: new Set(),
               addresses: new Set(),
               priceHistory: []
             };
           }
        }
        
        db[targetKey].priceHistory.push({
          date: r.date,
          price: r.price,
          vendor: r.vendor || 'Manual Index',
          timestamp: r.indexedAt || `${r.date}T23:59:59.999Z` // Prefer indexedAt or assume late in the day
        });
        if (r.vendor) db[targetKey].vendors.add(r.vendor);
      });
    });
    
    // Sort price history by date first, then timestamp, and calculate stats
    return Object.values(db).map(item => {
      const sortedHistory = [...item.priceHistory].sort((a, b) => {
        const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
        return dateDiff !== 0 ? dateDiff : new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      });
      const prices = sortedHistory.map(h => h.price);
      const hasPrices = prices.length > 0;
      return {
        ...item,
        priceHistory: sortedHistory,
        vendors: Array.from(item.vendors),
        categories: Array.from(item.categories),
        addresses: Array.from(item.addresses),
        minPrice: hasPrices ? Math.min(...prices) : 0,
        maxPrice: hasPrices ? Math.max(...prices) : 0,
        avgPrice: hasPrices ? (prices.reduce((a, b) => a + b, 0) / prices.length) : 0,
        latestPrice: hasPrices ? sortedHistory[sortedHistory.length - 1].price : 0
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [history, pushedRates, learningCounter]); // Depend on history, manual pushed rates, and learning modifications

  const uniqueAddresses = Array.from(new Set(history.map(h => h.address).filter(Boolean))) as string[];
  
  const guessCategory = (items: ExtractedMaterial[]): string => {
    const keywords: Record<string, string[]> = {
      'Electrical': ['wire', 'switch', 'cable', 'mcb', 'led', 'light', 'fan', 'conduit', 'socket'],
      'Plumbing': ['pipe', 'valve', 'cpvc', 'tank', 'tap', 'faucet', 'drain', 'bend', 'elbow'],
      'Carpenter': ['wood', 'ply', 'plywood', 'laminate', 'hinge', 'handle', 'adhesive', 'screw', 'nail'],
      'Tile': ['tile', 'spacer', 'grouts', 'adhesive', 'chemical', 'skirting'],
      'Stone': ['granite', 'marble', 'stone', 'quartz'],
      'Hvac': ['ac', 'copper', 'gas', 'compressor', 'duct'],
      'Civil': ['cement', 'sand', 'brick', 'steel', 'rcc', 'aggregate', 'concrete']
    };

    const counts: Record<string, number> = {};
    Object.keys(keywords).forEach(cat => counts[cat] = 0);

    items.forEach(item => {
      const name = (item.item_name || '').toLowerCase();
      Object.entries(keywords).forEach(([cat, words]) => {
        if (words.some(w => name.includes(w))) {
          counts[cat]++;
        }
      });
    });

    const max = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return max[1] > 0 ? max[0] : 'Civil';
  };

  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [bulkEditData, setBulkEditData] = useState({ unit: '', vendor: '', price: '' });

  const toggleItemSelection = (key: string) => {
    const next = new Set(selectedItems);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedItems(next);
  };

  const applyBulkEdit = () => {
    if (selectedItems.size === 0) return;
    
    // In a real database, we'd update a master table. 
    // Here we'll simulate by updating the auditLog and history items that match these items.
    // This is "soft" editing since the DB is derived from history.
    
    const updatedHistory = history.map(session => ({
      ...session,
      items: session.items.map(item => {
        const key = `${item.item_name.toLowerCase().trim()}_${item.unit?.toLowerCase().trim() || 'unit'}`;
        if (selectedItems.has(key)) {
          return {
            ...item,
            unit: bulkEditData.unit || item.unit,
            vendor: bulkEditData.vendor || item.vendor,
            unit_price: bulkEditData.price ? parseFloat(bulkEditData.price) : item.unit_price,
            total_amount: bulkEditData.price ? parseFloat(bulkEditData.price) * item.quantity : item.total_amount
          };
        }
        return item;
      })
    }));

    const updatedAudit = auditLog.map(item => {
      const key = `${item.item_name.toLowerCase().trim()}_${item.unit?.toLowerCase().trim() || 'unit'}`;
      if (selectedItems.has(key)) {
        return {
          ...item,
          unit: bulkEditData.unit || item.unit,
          vendor: bulkEditData.vendor || item.vendor,
          unit_price: bulkEditData.price ? parseFloat(bulkEditData.price) : item.unit_price,
          total_amount: bulkEditData.price ? parseFloat(bulkEditData.price) * item.quantity : item.total_amount
        };
      }
      return item;
    });

    saveHistory(updatedHistory);
    setAuditLog(updatedAudit);
    setSelectedItems(new Set());
    setIsSelectMode(false);
    setBulkEditData({ unit: '', vendor: '', price: '' });
    addDebug(`Bulk updated ${selectedItems.size} material types.`);
  };

  const deleteItem = (id: string, type: 'audit' | 'boq') => {
    addDebug(`Removing record ${id}...`);
    if (type === 'audit') {
      const filtered = auditLog.filter(item => item.id !== id);
      setAuditLog(filtered);
      saveAudit(filtered);
    } else {
      const filtered = boqItems.filter(item => item.id !== id);
      setBoqItems(filtered);
      saveBoq(filtered);
    }
    addDebug("Memory cleared.");
  };

  const pushRateToDatabase = (item: ExtractedMaterial) => {
    const key = `${item.item_name.toLowerCase().trim()}_${item.unit?.toLowerCase().trim() || 'unit'}`;
    const newRate = {
      date: item.date || new Date().toISOString().split('T')[0],
      price: item.unit_price || 0,
      vendor: item.vendor || 'Unknown',
      indexedAt: new Date().toISOString()
    };

    setPushedRates(prev => {
      const existing = prev[key] || [];
      const updated = existing.filter(r => !(r.date === newRate.date && r.price === newRate.price));
      return {
        ...prev,
        [key]: [...updated, newRate]
      };
    });
    addDebug(`Indexed: ${item.item_name} @ ₹${item.unit_price}`);
  };

  const bulkPushRatesToDatabase = () => {
    if (activeTab !== 'auditor' || auditLog.length === 0) return;
    
    let count = 0;
    const now = new Date().toISOString();

    setPushedRates(prev => {
      const nextPushedRates = { ...prev };
      
      auditLog.forEach(item => {
        if (!item.item_name || !item.unit_price) return;
        const key = `${item.item_name.toLowerCase().trim()}_${item.unit?.toLowerCase().trim() || 'unit'}`;
        const newRate = {
          date: item.date || new Date().toISOString().split('T')[0],
          price: item.unit_price,
          vendor: item.vendor || 'Unknown',
          indexedAt: now
        };

        const existing = nextPushedRates[key] || [];
        const updated = existing.filter(r => !(r.date === newRate.date && r.price === newRate.price));
        
        nextPushedRates[key] = [...updated, newRate];
        count++;
      });
      
      if (count > 0) {
        addDebug(`Bulk indexed ${count} new rates to database.`);
        return nextPushedRates;
      } else {
        addDebug("All rates already indexed.");
        return prev;
      }
    });
  };

  const deleteIndexedRate = (key: string, date: string, price: number) => {
    setPushedRates(prev => {
      const existing = prev[key] || [];
      const updated = existing.filter(r => !(r.date === date && r.price === price));
      if (updated.length === 0) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return {
        ...prev,
        [key]: updated
      };
    });
  };

  const [newCategoryName, setNewCategoryName] = useState('');

  const addCategory = () => {
    const cat = newCategoryName.trim();
    if (cat && !workCategories.includes(cat)) {
      setWorkCategories([...workCategories, cat]);
      setNewCategoryName('');
    }
  };

  const deleteCategory = (cat: string) => {
    setWorkCategories(workCategories.filter(c => c !== cat));
    if (categoryFilter === cat) setCategoryFilter('All');
  };

  const exportDatabaseToCSV = () => {
    if (itemDatabase.length === 0) {
      alert("Database is empty.");
      return;
    }

    const headers = ['Item Name', 'Unit', 'Categories', 'Vendors', 'Min Price (Rs)', 'Max Price (Rs)', 'Avg Price (Rs)', 'Latest Price (Rs)', 'Project Locations'];
    
    const rows = itemDatabase.map(item => [
      `"${item.name.replace(/"/g, '""')}"`,
      `"${item.unit.replace(/"/g, '""')}"`,
      `"${Array.from(item.categories).join(', ')}"`,
      `"${Array.from(item.vendors).join(', ')}"`,
      item.minPrice,
      item.maxPrice,
      Math.round(item.avgPrice),
      item.latestPrice,
      `"${Array.from(item.addresses).join(', ')}"`
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `material_database_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredHistory = React.useMemo(() => {
    let result = history;
    const search = searchQuery.trim();
    
    if (search) {
      const fuse = new Fuse(result, {
        keys: ['title', 'address', 'category'],
        threshold: 0.4,
      });
      result = fuse.search(search).map(r => r.item);
    }
    
    return result.filter(record => {
      const matchesCategory = categoryFilter === 'All' || record.category?.toLowerCase() === categoryFilter.toLowerCase();
      const matchesAddress = addressFilter === 'All' || record.address === addressFilter;
      return matchesCategory && matchesAddress;
    });
  }, [history, searchQuery, categoryFilter, addressFilter]);

  const activeLog = activeTab === 'auditor' ? auditLog : boqItems;
  const filteredActiveLog = React.useMemo(() => {
    const search = searchQuery.trim();
    if (!search) return activeLog;
    
    const fuse = new Fuse(activeLog, {
      keys: ['item_name', 'vendor', 'original_term'],
      threshold: 0.4,
    });
    return fuse.search(search).map(r => r.item);
  }, [activeLog, searchQuery]);

  const filteredItemDatabase = React.useMemo(() => {
    let result = itemDatabase;
    const search = searchQuery.trim();
    
    if (search) {
      const fuse = new Fuse(result, {
        keys: ['name'],
        threshold: 0.4,
      });
      result = fuse.search(search).map(r => r.item);
    }
    
    return result.filter(item => {
      const matchesCategory = categoryFilter === 'All' || item.categories.some(c => c.toLowerCase() === categoryFilter.toLowerCase());
      const matchesAddress = addressFilter === 'All' || item.addresses.includes(addressFilter);
      return matchesCategory && matchesAddress;
    });
  }, [itemDatabase, searchQuery, categoryFilter, addressFilter]);
  const activeSpend = activeTab === 'auditor' ? filteredActiveLog.reduce((acc, curr) => acc + (curr.total_amount || 0), 0) : 0;

  return (
    <div className="min-h-screen bg-[var(--color-brand-gray)] flex flex-col overflow-x-hidden">
      <header className="border-b border-[var(--color-brand-concrete)] bg-white px-4 md:px-6 py-4 flex flex-col md:flex-row items-center justify-between sticky top-0 z-20 gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="w-10 h-10 bg-[var(--color-brand-primary)] rounded flex items-center justify-center text-white font-bold shadow-md shadow-orange-100 shrink-0">
            <HardHat size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--color-brand-dark)]">NIRMĀṆ <span className="font-serif italic font-normal text-muted-foreground opacity-70">Auditor</span></h1>
            <p className="text-xs text-gray-500 font-mono uppercase tracking-widest leading-none mt-1 text-[10px]">On-Device Material Management</p>
          </div>
        </div>

        <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200 w-full md:w-auto overflow-x-auto no-scrollbar">
          <button 
            onClick={() => setActiveTab('auditor')}
            className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-3 md:px-4 py-2 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap
              ${activeTab === 'auditor' ? 'bg-white text-[var(--color-brand-dark)] shadow-sm' : 'text-gray-400 hover:text-gray-600'}
            `}
          >
            <LayoutDashboard size={14} /> Auditor
          </button>
          <button 
            onClick={() => setActiveTab('boq')}
            className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-3 md:px-4 py-2 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap
              ${activeTab === 'boq' ? 'bg-white text-[var(--color-brand-dark)] shadow-sm' : 'text-gray-400 hover:text-gray-600'}
            `}
          >
            <FileCode size={14} /> BOQ
          </button>
          <button 
            onClick={() => setActiveTab('database')}
            className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-3 md:px-4 py-2 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap
              ${activeTab === 'database' ? 'bg-white text-[var(--color-brand-dark)] shadow-sm' : 'text-gray-400 hover:text-gray-600'}
            `}
          >
            <Database size={14} /> Data
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-3 md:px-4 py-2 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap
              ${activeTab === 'history' ? 'bg-white text-[var(--color-brand-dark)] shadow-sm' : 'text-gray-400 hover:text-gray-600'}
            `}
          >
            <History size={14} /> History
          </button>
        </div>

        <div className="flex items-center gap-2 md:gap-4 w-full md:w-auto justify-between md:justify-end">
          <div className="text-right pr-3 border-r border-gray-100 leading-tight">
            <div className="text-[8px] md:text-[9px] uppercase tracking-widest text-gray-400 font-mono">
              {activeTab === 'auditor' ? 'Total Spent' : 'Items'}
            </div>
            <div className="text-xs md:text-sm font-mono font-bold">
              {activeTab === 'auditor' ? (
                `₹${activeSpend.toLocaleString('en-IN')}`
              ) : (
                `${filteredActiveLog.length} Recs`
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-1.5 md:gap-2">
            {(activeTab === 'auditor' || activeTab === 'boq') && activeLog.length > 0 && (
              <>
                <button 
                  onClick={saveToHistory}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 md:px-3 md:py-2 bg-blue-600 text-white text-[9px] md:text-[10px] font-bold uppercase tracking-wider rounded-lg shadow-md hover:bg-blue-700 transition-colors whitespace-nowrap"
                >
                  <Save size={14} className="md:w-4 md:h-4" /> <span>Save</span>
                </button>
                
                <button 
                  onClick={() => generatePDF(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 md:px-3 md:py-2 bg-white border border-gray-200 text-[var(--color-brand-dark)] text-[9px] md:text-[10px] font-bold uppercase tracking-wider rounded-lg shadow-sm hover:bg-gray-50 transition-colors whitespace-nowrap"
                  title="Preview PDF"
                >
                  <Eye size={14} className="md:w-4 md:h-4" /> <span>Preview</span>
                </button>
                
                <button 
                  onClick={() => generatePDF(false)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 md:px-3 md:py-2 bg-[var(--color-brand-primary)] text-white text-[9px] md:text-[10px] font-bold uppercase tracking-wider rounded-lg shadow-md hover:brightness-110 transition-colors whitespace-nowrap"
                  title="Download PDF"
                >
                  <Download size={14} className="md:w-4 md:h-4" /> <span>PDF</span>
                </button>
              </>
            )}

            <button 
              onClick={() => setShowClearConfirm(true)}
              className={`p-2 rounded-lg transition-all ${showClearConfirm ? 'bg-red-500 text-white' : 'text-gray-300 hover:text-red-500 hover:bg-red-50'}`}
              title="Clear current log"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* Floating Clear Confirmation */}
        <AnimatePresence>
          {showClearConfirm && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute top-full left-0 right-0 mt-2 px-4 z-30 md:left-auto md:right-6 md:w-64"
            >
              <div className="bg-red-600 text-white p-3 rounded-xl shadow-xl flex items-center justify-between gap-4">
                <span className="text-[10px] font-bold uppercase tracking-widest">Clear all data?</span>
                <div className="flex gap-2">
                  <button onClick={clearAll} className="px-3 py-1 bg-white text-red-600 text-[10px] font-bold rounded-md uppercase">Yes</button>
                  <button onClick={() => setShowClearConfirm(false)} className="px-3 py-1 bg-red-700 text-white text-[10px] font-bold rounded-md uppercase underline">No</button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden h-auto md:h-[calc(100vh-73px)]">
        <section className="w-full lg:w-[400px] bg-white border-r border-[var(--color-brand-concrete)] flex flex-col p-4 md:p-6 overflow-y-auto">
          {activeTab === 'history' ? (
            <div className="space-y-6">
              <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl">
                <h3 className="text-sm font-bold text-orange-900 flex items-center gap-2">
                  <History size={16} /> Saved Sessions
                </h3>
                <p className="text-[10px] text-orange-700 mt-1">Manage and restore your past Bill of Quantities sessions.</p>
              </div>
              <div className="text-[10px] font-mono text-gray-400 uppercase tracking-widest px-1">Storage Usage</div>
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                <div className="flex justify-between items-center text-[10px] mb-2 font-bold">
                  <span>Browser Memory</span>
                  <span>{history.length} Sessions</span>
                </div>
                <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-400 w-full" />
                </div>
                <p className="text-[8px] text-gray-400 mt-2 uppercase tracking-tight">Unlimited Local Storage Enabled</p>
              </div>
              <button 
                onClick={() => setActiveTab('boq')}
                className="w-full py-3 bg-white border border-gray-200 rounded-xl text-xs font-bold uppercase tracking-widest text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
              >
                <Plus size={14} /> Create New BOQ
              </button>
            </div>
          ) : (
            <>
              <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-3">
            <Database size={18} className="text-blue-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-bold text-blue-900 mb-1">Local Project Storage</p>
              <p className="text-[10px] text-blue-700 leading-normal">
                {activeTab === 'auditor' 
                 ? "Records are kept in this phone's memory. No data is sent to external servers." 
                 : "Create a list for price quotation. Prices are included from vendor PDFs."}
              </p>
              {Object.keys(JSON.parse(localStorage.getItem('nirmaan_learning_v1') || '{}')).length > 0 && (
                <button 
                  onClick={clearLearning}
                  className="mt-2 text-[8px] font-bold text-blue-500 uppercase hover:underline"
                >
                  Reset {Object.keys(JSON.parse(localStorage.getItem('nirmaan_learning_v1') || '{}')).length} Learned Patterns
                </button>
              )}
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-xs font-mono uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
              <Plus size={12} /> New {activeTab === 'auditor' ? 'Audit' : 'BOQ'} Entry
            </h2>
            
            <div className="space-y-4">
              <div 
                className={`relative border-2 border-dashed rounded-xl transition-all min-h-[12rem] flex flex-col items-center justify-center gap-4 p-4
                  ${dragActive ? 'border-[var(--color-brand-primary)] bg-orange-50' : 'border-[var(--color-brand-concrete)] hover:border-gray-400'}
                  ${selectedImages.length > 0 ? 'bg-gray-50 border-solid' : 'bg-transparent'}
                `}
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
                }}
              >
                {selectedImages.length > 0 ? (
                  <div className="w-full">
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      {selectedImages.map((src, idx) => (
                        <div key={idx} className="relative aspect-square bg-white rounded-lg border border-gray-200 overflow-hidden group">
                          <img src={src} alt={`Page ${idx + 1}`} className="w-full h-full object-cover" />
                          <button 
                            onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
                            className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                      {selectedImages.length < 5 && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                          className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-gray-500 hover:text-gray-500 transition-all bg-white/50"
                        >
                          <Plus size={20} />
                          <span className="text-[8px] font-bold uppercase">Add More</span>
                        </button>
                      )}
                    </div>
                    <div className="text-center">
                       <p className="text-[10px] font-mono text-orange-600 font-bold uppercase tracking-widest leading-none">
                         {selectedImages.length}/5 Images Uploaded
                       </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center" onClick={() => fileInputRef.current?.click()}>
                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 mx-auto mb-2">
                      <ImageIcon size={24} />
                    </div>
                    <p className="text-sm font-medium text-gray-600">Drop Bills or Take Photos</p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider font-mono">Up to 5 images for one single BOQ</p>
                  </div>
                )}
                <input 
                  type="file" 
                  className="hidden" 
                  ref={fileInputRef} 
                  accept="image/*" 
                  multiple
                  onChange={(e) => e.target.files && handleFiles(e.target.files)} 
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] font-mono uppercase tracking-wider text-gray-500 font-bold">Input Details</label>
                  <div className="flex gap-2">
                    {inputText && (
                      <button 
                        onClick={() => setInputText('')}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase transition-all bg-gray-100 text-gray-400 hover:text-red-500"
                      >
                        <X size={10} /> Clear
                      </button>
                    )}
                    <button 
                      onClick={toggleListening}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase transition-all
                        ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}
                      `}
                    >
                      {isListening ? <MicOff size={10} /> : <Mic size={10} />}
                      {isListening ? 'Stop' : 'Voice Input'}
                    </button>
                  </div>
                </div>
                <textarea 
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={activeTab === 'auditor' ? "Example: '15 bori cement bought for 7500'" : "Example: 'Item: Brickwork, Quantity: 500 sqft, Rate: 45'"}
                  className="w-full h-32 p-4 bg-gray-50 border border-[var(--color-brand-concrete)] rounded-xl text-sm focus:ring-1 focus:ring-[var(--color-brand-primary)] focus:border-[var(--color-brand-primary)] outline-none transition-all resize-none font-mono"
                />
              </div>

              {activeTab === 'boq' && (
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between items-end">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-blue-500 font-bold">General Specifications</label>
                    {generalNotes && (
                      <button 
                        onClick={() => saveNotes('')}
                        className="text-[9px] font-bold text-blue-400 hover:text-red-500 uppercase tracking-tighter"
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                  <textarea 
                    value={generalNotes}
                    onChange={(e) => saveNotes(e.target.value)}
                    placeholder="Enter color codes, finishes (glossy/matt), or specific brand requests here for the PDF..."
                    className="w-full h-24 p-3 bg-blue-50/50 border border-blue-100 rounded-xl text-[11px] focus:ring-1 focus:ring-blue-400 outline-none transition-all resize-none"
                  />
                </div>
              )}

              {isProcessing && (
                <div className="space-y-3 p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="flex justify-between text-[10px] font-mono uppercase tracking-widest text-gray-500">
                    <span className="flex items-center gap-2">
                      <Loader2 size={10} className="animate-spin" />
                      {statusMessage}
                    </span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                    <motion.div 
                      key="progress-bar-inner"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.3 }}
                      className="h-full bg-[var(--color-brand-primary)]"
                    />
                  </div>
                  
                  <div className="pt-2 border-t border-gray-200 mt-2">
                    <div className="text-[9px] font-mono text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                      <History size={10} /> Live Debug Trace
                    </div>
                    <div className="space-y-1">
                      {debugLog.map((log, i) => (
                        <div key={i} className="text-[9px] font-mono text-gray-600 truncate opacity-90">{log}</div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <button 
                onClick={handleProcess}
                disabled={isProcessing || (!inputText && selectedImages.length === 0)}
                className="w-full h-12 bg-[var(--color-brand-primary)] text-white font-bold rounded-xl flex items-center justify-center gap-3 hover:brightness-110 active:scale-[0.98] transition-all disabled:grayscale disabled:opacity-50 shadow-lg shadow-orange-100"
              >
                {isProcessing ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    <span className="uppercase tracking-widest text-sm text-[16px]">Processing...</span>
                  </>
                ) : (
                  <>
                    <ClipboardCheck size={20} />
                    <span className="uppercase tracking-widest text-sm text-[16px]">AI Extraction</span>
                  </>
                )}
              </button>
            </div>
          </div>
          </>
          )}
        </section>

        <section className="flex-1 flex flex-col technical-grid overflow-hidden bg-white mt-4 lg:mt-0">
          <div className="p-4 md:p-6 pb-0 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <h2 className="text-[10px] md:text-xs font-mono uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
              {activeTab === 'history' ? <History size={12} /> : activeTab === 'database' ? <Database size={12} /> : activeTab === 'auditor' ? <FileText size={12} /> : <FileCode size={12} />}
              {activeTab === 'history' ? 'BOQ Archive' : activeTab === 'database' ? 'Material Database' : activeTab === 'auditor' ? 'Audit Log' : 'BOQ Draft'}
            </h2>
            <div className="relative w-full md:w-auto">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={activeTab === 'history' ? "Search archives..." : activeTab === 'database' ? "Search materials..." : "Filter memory..." }
                className="w-full md:w-64 pl-8 pr-4 py-2 bg-gray-50 border border-[var(--color-brand-concrete)] rounded-full text-xs font-mono outline-none focus:border-gray-400 transition-all"
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto p-4 md:p-6">
            {activeTab === 'database' ? (
              <div className="space-y-6">
                <div className="flex border-b border-gray-200">
                  <button
                    onClick={() => setDbSubTab('materials')}
                    className={`px-6 py-3 text-xs font-bold uppercase tracking-widest transition-all border-b-2
                      ${dbSubTab === 'materials' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                  >
                    Materials
                  </button>
                  <button
                    onClick={() => setDbSubTab('indexed')}
                    className={`px-6 py-3 text-xs font-bold uppercase tracking-widest transition-all border-b-2
                      ${dbSubTab === 'indexed' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                  >
                    Indexed Log
                  </button>
                  <button
                    onClick={() => setDbSubTab('categories')}
                    className={`px-6 py-3 text-xs font-bold uppercase tracking-widest transition-all border-b-2
                      ${dbSubTab === 'categories' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                  >
                    Categories
                  </button>
                </div>

                {dbSubTab === 'materials' && (
                  <>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap gap-2">
                    {['All', ...workCategories].map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setCategoryFilter(cat)}
                        className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all
                          ${categoryFilter === cat 
                            ? 'bg-orange-500 text-white shadow-md' 
                            : 'bg-white border border-gray-200 text-gray-500 hover:border-orange-300'}
                        `}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {uniqueAddresses.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <div className="text-[9px] font-mono uppercase tracking-widest text-gray-400 font-bold px-1 flex items-center gap-2">
                        <Truck size={10} /> Filter by Project Location
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setAddressFilter('All')}
                          className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase transition-all
                            ${addressFilter === 'All' 
                              ? 'bg-gray-800 text-white' 
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}
                          `}
                        >
                          All Addresses
                        </button>
                        {uniqueAddresses.map((addr) => (
                          <button
                            key={addr}
                            onClick={() => setAddressFilter(addr)}
                            className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase transition-all truncate max-w-[150px]
                              ${addressFilter === addr 
                                ? 'bg-gray-800 text-white' 
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}
                            `}
                          >
                            {addr}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        setIsSelectMode(!isSelectMode);
                        if (isSelectMode) setSelectedItems(new Set());
                      }}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border
                        ${isSelectMode ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}
                      `}
                    >
                      {isSelectMode ? 'Cancel Selection' : 'Select Items'}
                    </button>
                    {isSelectMode && selectedItems.size > 0 && (
                      <div className="text-[10px] font-mono font-bold text-orange-600 flex items-center bg-orange-50 px-3 rounded-lg border border-orange-100">
                        {selectedItems.size} Selected
                      </div>
                    )}
                    <button
                      onClick={exportDatabaseToCSV}
                      className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border bg-white text-green-600 border-green-200 hover:border-green-400 hover:bg-green-50 flex items-center gap-1.5 ml-auto"
                      title="Export filtered items to CSV"
                    >
                      <Download size={12} /> Export CSV
                    </button>
                  </div>

                  <AnimatePresence>
                    {isSelectMode && selectedItems.size > 0 && (
                      <motion.div 
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="flex flex-wrap items-center gap-2 bg-gray-50 p-2 rounded-xl border border-gray-200 shadow-sm"
                      >
                        <input 
                          type="text" 
                          placeholder="New Unit"
                          value={bulkEditData.unit}
                          onChange={e => setBulkEditData(p => ({ ...p, unit: e.target.value }))}
                          className="px-2 py-1 text-[10px] border border-gray-200 rounded w-16 outline-none focus:border-orange-300"
                        />
                        <input 
                          type="text" 
                          placeholder="New Vendor"
                          value={bulkEditData.vendor}
                          onChange={e => setBulkEditData(p => ({ ...p, vendor: e.target.value }))}
                          className="px-2 py-1 text-[10px] border border-gray-200 rounded w-20 outline-none focus:border-orange-300"
                        />
                        <input 
                          type="number" 
                          placeholder="New Price"
                          value={bulkEditData.price}
                          onChange={e => setBulkEditData(p => ({ ...p, price: e.target.value }))}
                          className="px-2 py-1 text-[10px] border border-gray-200 rounded w-16 outline-none focus:border-orange-300"
                        />
                        <button 
                          onClick={applyBulkEdit}
                          className="bg-orange-500 text-white px-3 py-1 rounded text-[10px] font-bold uppercase hover:bg-orange-600"
                        >
                          Apply to All
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm w-full">
                  <div className="overflow-x-auto">
                    <div className="min-w-[700px]">
                      <div className="grid grid-cols-[auto_1.5fr_1fr_2fr_1.5fr] px-6 py-4 bg-gray-50 border-b border-gray-200 items-center">
                    <div className="w-8"></div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Material Item</div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 text-center">Latest Price (₹)</div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Suppliers / Vendors</div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 text-right pr-4">Price Trend</div>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {filteredItemDatabase.length === 0 ? (
                      <div className="p-20 text-center text-gray-300">
                        <Database size={48} className="mx-auto mb-4 opacity-20" />
                        <p className="font-mono text-sm uppercase tracking-widest">No Items Match Filters</p>
                      </div>
                    ) : (
                      filteredItemDatabase
                        .map((item, idx) => {
                          const key = `${item.name.toLowerCase().trim()}_${item.unit.toLowerCase().trim()}`;
                          return (
                            <div 
                              key={idx} 
                              onClick={() => isSelectMode && toggleItemSelection(key)}
                              className={`grid grid-cols-[auto_1.5fr_1fr_2fr_1.5fr] px-6 py-5 items-center hover:bg-gray-50/80 transition-colors cursor-pointer
                                ${selectedItems.has(key) ? 'bg-orange-50/50' : ''}
                              `}
                            >
                              <div className="w-8 flex items-center">
                                {isSelectMode && (
                                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors
                                    ${selectedItems.has(key) ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-300 bg-white'}
                                  `}>
                                    {selectedItems.has(key) && <Check size={10} strokeWidth={4} />}
                                  </div>
                                )}
                              </div>
                              <div>
                                <div className="font-bold text-sm text-gray-900">{item.name}</div>
                                <div className="text-[10px] text-gray-400 font-mono uppercase tracking-tighter">Unit: {item.unit}</div>
                              </div>
                              <div className="text-center">
                                <div className="font-mono font-bold text-sm">₹{Math.round(item.latestPrice).toLocaleString()}</div>
                                <div className="text-[9px] text-gray-400 font-mono">Range: ₹{item.minPrice}-₹{item.maxPrice}</div>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {item.vendors.map(v => (
                                  <span key={v} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[9px] font-bold flex items-center gap-1 border border-gray-200">
                                    <Truck size={8} /> {v}
                                  </span>
                                ))}
                                {item.vendors.length === 0 && <span className="text-[10px] text-gray-300 italic">No vendors linked</span>}
                              </div>
                              <div className="h-16 w-full flex justify-end">
                                <div className="w-full max-w-[150px] h-full">
                                  {item.priceHistory.filter(h => h.price > 0).length > 1 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                      <AreaChart data={item.priceHistory.filter(h => h.price > 0)}>
                                        <defs>
                                          <linearGradient id={`colorPrice-${idx}`} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                                          </linearGradient>
                                        </defs>
                                        <Area 
                                          type="monotone" 
                                          dataKey="price" 
                                          stroke="#f97316" 
                                          fillOpacity={1} 
                                          fill={`url(#colorPrice-${idx})`} 
                                          strokeWidth={2}
                                        />
                                        <Tooltip 
                                          labelStyle={{ fontSize: '10px' }} 
                                          contentStyle={{ fontSize: '10px', borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                          formatter={(value: any) => [`₹${value}`, 'Price']}
                                        />
                                      </AreaChart>
                                    </ResponsiveContainer>
                                  ) : (
                                    <div className="h-full w-full flex items-center justify-center text-[10px] text-gray-300 font-mono italic border border-dashed border-gray-100 rounded">
                                      Need 2+ data pts
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })
                    )}
                  </div>
                    </div>
                  </div>
                </div>
                
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl flex items-center gap-4">
                  <TrendingUp className="text-orange-500" />
                  <div>
                    <h4 className="text-xs font-bold text-gray-700">Database Indexing Active</h4>
                    <p className="text-[10px] text-gray-500">Every audit entry or history record automatically enhances your item index with historical price intelligence.</p>
                  </div>
                </div>
                </>
                )}

                {dbSubTab === 'indexed' && (
                  <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm w-full">
                    <div className="overflow-x-auto">
                      <div className="min-w-[650px]">
                    <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_auto] px-6 py-4 bg-gray-50 border-b border-gray-200 items-center">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Material Item</div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 text-center">Cost Rate (₹)</div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Vendor</div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 text-right">Indexed When</div>
                      <div className="w-8 pl-4"></div>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {Object.entries(pushedRates).flatMap(([key, rates]: [string, any]) => rates.map((r: any, i: number) => ({
                          key, 
                          name: key.split('_')[0], 
                          unit: key.split('_')[1], 
                          ...r, 
                          index: i
                        }))).sort((a, b: any) => new Date(b.indexedAt || b.date).getTime() - new Date(a.indexedAt || a.date).getTime()).length === 0 ? (
                        <div className="p-20 text-center text-gray-300">
                          <p className="font-mono text-sm uppercase tracking-widest">No Manual Indexing Found</p>
                        </div>
                      ) : (
                        Object.entries(pushedRates).flatMap(([key, rates]: [string, any]) => rates.map((r: any, i: number) => ({
                          key, 
                          name: key.split('_')[0], 
                          unit: key.split('_')[1], 
                          ...r, 
                          index: i
                        }))).sort((a, b: any) => new Date(b.indexedAt || b.date).getTime() - new Date(a.indexedAt || a.date).getTime()).map((item, idx) => (
                          <div key={idx} className="grid grid-cols-[1.5fr_1fr_1fr_1fr_auto] px-6 py-4 items-center hover:bg-gray-50/80 transition-colors">
                            <div>
                              <div className="font-bold text-sm text-gray-900">{item.name}</div>
                              <div className="text-[10px] text-gray-400 font-mono uppercase tracking-tighter">Unit: {item.unit}</div>
                            </div>
                            <div className="text-center font-mono font-bold text-sm text-gray-600">₹{item.price}</div>
                            <div className="flex items-center gap-1.5 text-xs text-gray-500 font-mono">
                              <Truck size={12} /> {item.vendor}
                            </div>
                            <div className="text-right flex flex-col items-end">
                              <div className="text-[10px] font-bold text-gray-600">{item.date}</div>
                              {item.indexedAt && (
                                <div className="text-[8px] text-gray-400 font-mono" title="Indexed At">
                                  {new Date(item.indexedAt).toLocaleString('en-GB')}
                                </div>
                              )}
                            </div>
                            <div className="pl-4">
                              <button 
                                onClick={() => deleteIndexedRate(item.key, item.date, item.price)}
                                className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                title="Remove from Index"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                      </div>
                    </div>
                  </div>
                )}

                {dbSubTab === 'categories' && (
                  <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm max-w-2xl mx-auto">
                    <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Work Categories</div>
                      <div className="text-[10px] font-mono text-gray-500">{workCategories.length} Total</div>
                    </div>
                    <div className="p-6">
                      <div className="flex gap-2 mb-6">
                        <input 
                          type="text" 
                          value={newCategoryName}
                          onChange={e => setNewCategoryName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addCategory()}
                          placeholder="Add new category (e.g. Earthwork)"
                          className="flex-1 px-4 py-2 border border-gray-200 rounded-xl outline-none font-mono text-sm focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all"
                        />
                        <button 
                          onClick={addCategory}
                          className="px-6 py-2 bg-orange-500 text-white font-bold rounded-xl text-xs uppercase tracking-widest hover:bg-orange-600 transition-colors"
                        >
                          Add
                        </button>
                      </div>
                      
                      <div className="flex flex-wrap gap-3">
                        {workCategories.map(cat => (
                          <div key={cat} className="flex items-center gap-2 pl-4 pr-1 py-1 bg-gray-50 border border-gray-200 rounded-full group">
                            <span className="text-xs font-bold text-gray-700">{cat}</span>
                            <button 
                              onClick={() => deleteCategory(cat)}
                              className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : activeTab === 'history' ? (
              <div className="space-y-6">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap gap-2">
                    {['All', ...workCategories].map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setCategoryFilter(cat)}
                        className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all
                          ${categoryFilter === cat 
                            ? 'bg-orange-500 text-white shadow-md' 
                            : 'bg-white border border-gray-200 text-gray-500 hover:border-orange-300'}
                        `}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {uniqueAddresses.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <div className="text-[9px] font-mono uppercase tracking-widest text-gray-400 font-bold px-1 flex items-center gap-2">
                        <Truck size={10} /> Filter by Address
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setAddressFilter('All')}
                          className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase transition-all
                            ${addressFilter === 'All' 
                              ? 'bg-gray-800 text-white' 
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}
                          `}
                        >
                          All Addresses
                        </button>
                        {uniqueAddresses.map((addr) => (
                          <button
                            key={addr}
                            onClick={() => setAddressFilter(addr)}
                            className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase transition-all truncate max-w-[150px]
                              ${addressFilter === addr 
                                ? 'bg-gray-800 text-white' 
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}
                            `}
                          >
                            {addr}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredHistory.length === 0 ? (
                    <div className="col-span-full p-20 flex flex-col items-center justify-center text-gray-300 border-2 border-dashed border-gray-100 rounded-2xl">
                      <History size={48} strokeWidth={1} />
                      <p className="mt-4 font-mono text-sm uppercase tracking-widest text-center">No matching sessions<br/><span className="text-[10px] normal-case italic">Check your filters or search terms</span></p>
                    </div>
                  ) : (
                    filteredHistory.map((record) => (
                    <motion.div 
                      key={record.id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-white border border-gray-200 rounded-2xl p-5 hover:border-orange-200 hover:shadow-lg transition-all group relative overflow-hidden"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex-1 min-w-0" onClick={() => editHistoryMetadata(record)}>
                          <div className="flex items-center gap-2">
                             <h3 className="font-bold text-gray-900 group-hover:text-orange-600 transition-colors uppercase tracking-tight truncate cursor-pointer underline decoration-dotted decoration-gray-300 underline-offset-4">{record.title}</h3>
                             <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-[8px] font-bold rounded uppercase shrink-0">{record.category || 'Civil'}</span>
                          </div>
                          <div className="flex flex-col gap-0.5 mt-1">
                            <span className="text-[10px] font-mono text-gray-400">{new Date(record.timestamp).toLocaleString()}</span>
                            {record.address && <span className="text-[9px] text-gray-500 italic truncate">📍 {record.address}</span>}
                            <span className="text-[10px] font-bold text-gray-500 uppercase">{record.items.length} Items</span>
                          </div>
                        </div>
                        <div className="flex gap-1 items-center">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              editHistoryMetadata(record);
                            }}
                            className="p-2 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                            title="Edit record info"
                          >
                            <Plus size={16} className="rotate-45" /> {/* Using Plus rotated as a pencil alternative if Pencil isn't imported, but wait, I can use ChevronRight or just a text button */}
                            <span className="text-[9px] font-bold uppercase ml-1">Edit</span>
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteHistoryRecord(record.id);
                            }}
                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      
                      <div className="space-y-1 mb-4 max-h-20 overflow-hidden relative">
                         {record.items.slice(0, 3).map(item => (
                           <div key={item.id} className="text-[10px] text-gray-500 flex justify-between">
                             <span>• {item.item_name}</span>
                             <span className="font-mono">{item.quantity} {item.unit}</span>
                           </div>
                         ))}
                         {record.items.length > 3 && (
                           <div className="text-[10px] text-gray-400 italic mt-1">+ {record.items.length - 3} more items...</div>
                         )}
                         <div className="absolute bottom-0 inset-x-0 h-4 bg-gradient-to-t from-white to-transparent" />
                      </div>

                      {record.notes && (
                        <div className="mb-4 text-[9px] text-gray-400 italic line-clamp-1 border-l border-gray-200 pl-2">
                          "{record.notes}"
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button 
                          onClick={() => loadFromHistory(record)}
                          className="flex-1 py-2 bg-gray-900 text-white text-[10px] font-bold uppercase tracking-widest rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
                        >
                          <Eye size={12} /> Open & Restore
                        </button>
                      </div>
                    </motion.div>
                  ))
                )}
                </div>
              </div>
            ) : (
              <>
                <div className="bg-white border border-[var(--color-brand-concrete)] rounded-xl overflow-hidden shadow-sm w-full">
                  <div className="overflow-x-auto">
                    <div className="min-w-[600px]">
              <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_40px] px-4 md:px-6 py-3 border-b border-gray-100 bg-gray-50/50">
                <div className="text-[9px] md:text-[10px] font-mono font-bold uppercase tracking-widest text-gray-400">Description</div>
                <div className="text-[9px] md:text-[10px] font-mono font-bold uppercase tracking-widest text-gray-400 text-center">Qty</div>
                <div className="text-[9px] md:text-[10px] font-mono font-bold uppercase tracking-widest text-gray-400 text-center">{activeTab === 'auditor' ? 'Rate' : '-'}</div>
                <div className="text-[9px] md:text-[10px] font-mono font-bold uppercase tracking-widest text-gray-400 text-right">{activeTab === 'auditor' ? 'Total' : '-'}</div>
                <div className="text-[9px] md:text-[10px] font-mono font-bold uppercase tracking-widest text-gray-400 text-right">{activeTab === 'auditor' ? 'Vendor' : 'Date'}</div>
                <div></div>
              </div>

              <div className="divide-y divide-gray-50 overflow-y-auto min-h-[300px] max-h-none">
                <AnimatePresence initial={false}>
                  {filteredActiveLog.length === 0 ? (
                    <div className="p-12 md:p-20 flex flex-col items-center justify-center text-gray-300">
                      {activeTab === 'auditor' ? <HardHat size={48} strokeWidth={1} /> : <FileCode size={48} strokeWidth={1} />}
                      <p className="mt-4 font-mono text-sm uppercase tracking-widest text-center">
                        {searchQuery ? 'No match in search' : 'No Data Found'}<br/>
                        <span className="text-[10px] normal-case">{searchQuery ? 'Try clearing filters' : 'Add items via OCR or manual entry'}</span>
                      </p>
                    </div>
                  ) : (
                    filteredActiveLog.map((item) => (
                      <motion.div 
                        key={item.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className={`grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_40px] items-center px-4 md:px-6 py-4 transition-colors group
                          ${editingId === item.id ? 'bg-orange-50/50 ring-1 ring-orange-200 z-10' : 'hover:bg-gray-100/50'}
                        `}
                      >
                        {editingId === item.id ? (
                          // Editing State
                          <>
                            <div>
                              <input 
                                autoFocus
                                className="w-full text-xs md:text-sm font-bold border-b border-orange-300 bg-transparent outline-none pb-1"
                                value={editingItem.item_name}
                                onChange={e => setEditingItem(p => ({ ...p, item_name: e.target.value }))}
                              />
                              <div className="text-[10px] text-orange-400 mt-1">Editing Mode</div>
                            </div>
                            <div className="text-center px-2 flex gap-1">
                              <input 
                                className="w-12 text-center text-xs font-mono border-b border-orange-300 bg-transparent outline-none"
                                value={editingItem.quantity}
                                onChange={e => setEditingItem(p => ({ ...p, quantity: e.target.value as any }))}
                              />
                              <input 
                                className="w-12 text-center text-[10px] border-b border-orange-300 bg-transparent outline-none"
                                value={editingItem.unit}
                                onChange={e => setEditingItem(p => ({ ...p, unit: e.target.value }))}
                              />
                            </div>
                            <div className="text-center">
                              {activeTab === 'auditor' ? (
                                <input 
                                  className="w-16 text-center text-xs font-mono border-b border-orange-300 bg-transparent outline-none"
                                  value={editingItem.unit_price}
                                  onChange={e => setEditingItem(p => ({ ...p, unit_price: e.target.value as any }))}
                                  placeholder="Rate"
                                />
                              ) : '--'}
                            </div>
                            <div className="text-right">
                              {activeTab === 'auditor' ? (
                                <div className="text-[10px] md:text-xs font-mono font-bold text-orange-600">
                                  ₹{((Number(editingItem.quantity) || 0) * (Number(editingItem.unit_price) || 0)).toLocaleString('en-IN')}
                                </div>
                              ) : '--'}
                            </div>
                            <div className="flex flex-col gap-1 items-end">
                               {activeTab === 'auditor' && (
                                 <input 
                                   className="w-20 text-right text-[10px] border-b border-orange-300 bg-transparent outline-none"
                                   value={editingItem.vendor}
                                   onChange={e => setEditingItem(p => ({ ...p, vendor: e.target.value }))}
                                   placeholder="Vendor"
                                 />
                               )}
                               <div className="flex justify-end gap-2 pr-2 mt-1">
                                 <button onClick={saveEdit} className="p-1.5 bg-green-500 text-white rounded hover:bg-green-600 shadow-sm" title="Save Changes">
                                   <Check size={14} />
                                 </button>
                                 <button onClick={cancelEdit} className="p-1.5 bg-gray-200 text-gray-600 rounded hover:bg-gray-300 shadow-sm" title="Cancel">
                                   <X size={14} />
                                 </button>
                               </div>
                            </div>
                            <div></div>
                          </>
                        ) : (
                          // Display State
                          (() => {
                            const dbMatch = itemDatabase.find(db => db.name.toLowerCase() === item.item_name.toLowerCase() && db.unit.toLowerCase() === (item.unit || 'unit').toLowerCase());
                            const diffPercent = dbMatch && item.unit_price && dbMatch.latestPrice > 0 
                              ? ((item.unit_price - dbMatch.latestPrice) / dbMatch.latestPrice) * 100 
                              : 0;
                            const isHigher = diffPercent > 2; // > 2% difference
                            const isLower = diffPercent < -2;
                            const key = `${item.item_name.toLowerCase().trim()}_${item.unit?.toLowerCase().trim() || 'unit'}`;
                            const itemDate = item.date || new Date().toISOString().split('T')[0];
                            const isIndexed = dbMatch && dbMatch.priceHistory.length > 0 && dbMatch.latestPrice === item.unit_price && dbMatch.priceHistory[dbMatch.priceHistory.length - 1].date === itemDate;

                            return (
                              <>
                                <div onClick={() => startEditing(item)} className="cursor-pointer group/item">
                                  <div className="font-bold text-xs md:text-sm text-[var(--color-brand-dark)] flex items-center gap-2">
                                    {item.item_name}
                                    <ChevronRight size={12} className="text-gray-300 group-hover/item:text-orange-400 transition-colors" />
                                  </div>
                                  <div className="text-[9px] md:text-[10px] font-mono text-gray-400 italic truncate max-w-[100px] md:max-w-[150px]">"{item.original_term}"</div>
                                </div>
                                
                                <div className="text-center">
                                  <span className="text-[11px] md:text-sm font-mono font-medium px-2 py-1 bg-gray-50 rounded">
                                    {item.quantity} <span className="text-[9px] md:text-[10px] text-gray-400">{item.unit}</span>
                                  </span>
                                </div>
        
                                <div className="text-center font-mono text-[10px] md:text-xs text-gray-500 relative flex flex-col items-center justify-center">
                                  {activeTab === 'auditor' ? (
                                    <>
                                      <div className="flex items-center justify-center gap-1">
                                        ₹{item.unit_price?.toLocaleString('en-IN') || '0'}
                                        {dbMatch && (isHigher || isLower) && (
                                          <div className={`group relative cursor-help`}>
                                            <AlertTriangle size={10} className={isHigher ? 'text-red-500' : 'text-green-500'} />
                                            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[8px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-30 pointer-events-none">
                                              {isHigher ? 'Rate higher than index' : 'Great rate! Lower than index'} (Last: ₹{dbMatch.latestPrice.toLocaleString('en-IN')})
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                      {dbMatch && (
                                        <div className="text-[8px] text-gray-400 mt-0.5" title="Latest indexed rate">
                                          Index Last: ₹{dbMatch.latestPrice.toLocaleString('en-IN')}
                                        </div>
                                      )}
                                    </>
                                  ) : '--'}
                                </div>
        
                                <div className="text-right font-mono font-bold text-xs md:text-sm text-[var(--color-brand-dark)]">
                                  {activeTab === 'auditor' ? `₹${(item.total_amount || 0).toLocaleString('en-IN')}` : '--'}
                                </div>
        
                                <div className="text-right flex flex-col justify-center">
                                  <div className="text-[9px] md:text-[11px] font-bold text-gray-600 truncate max-w-[80px] md:max-w-[120px] ml-auto flex items-center justify-end gap-1">
                                    {activeTab === 'auditor' ? <Truck size={10} /> : <Calendar size={10} />}
                                    {activeTab === 'auditor' ? item.vendor : item.date}
                                  </div>
                                  {activeTab === 'auditor' && (
                                    <div className="mt-1 flex justify-end">
                                      {isIndexed ? (
                                        <div className="flex items-center gap-1 text-[8px] font-bold uppercase text-green-600 bg-green-50 px-1.5 py-0.5 rounded border border-green-100">
                                          <Check size={8} /> Indexed
                                        </div>
                                      ) : (
                                        <button 
                                          onClick={(e) => { e.stopPropagation(); pushRateToDatabase(item); }}
                                          className="flex items-center gap-1 text-[8px] font-bold uppercase text-orange-600 hover:text-white hover:bg-orange-500 px-1.5 py-0.5 rounded border border-orange-200 transition-all"
                                          title="Verify and Index this rate"
                                        >
                                          <Zap size={8} /> Index Rate?
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
        
                                <div className="flex justify-end pr-2">
                                  <button 
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      deleteItem(item.id, activeTab === 'auditor' ? 'audit' : 'boq');
                                    }}
                                    className="p-2.5 text-red-500 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100"
                                    title="Delete Item"
                                  >
                                    <Trash2 size={18} />
                                  </button>
                                </div>
                              </>
                            );
                          })()
                        )}
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2 md:gap-4 order-2 sm:order-1">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-[var(--color-brand-concrete)] rounded-full text-[9px] md:text-[10px] uppercase font-mono tracking-widest text-gray-500 shadow-sm">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" /> SYNCED
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-[var(--color-brand-concrete)] rounded-full text-[9px] md:text-[10px] uppercase font-mono tracking-widest text-gray-500 shadow-sm">
                  <History size={12} /> {filteredActiveLog.length} Records
                </div>
              </div>

              {activeTab === 'auditor' && auditLog.length > 0 && (
                <button 
                  onClick={bulkPushRatesToDatabase}
                  className="w-full sm:w-auto order-1 sm:order-2 flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-br from-orange-500 to-orange-600 text-white text-[10px] font-bold uppercase tracking-widest rounded-xl shadow-lg shadow-orange-100 hover:shadow-orange-200 transition-all hover:-translate-y-0.5 active:scale-95 group"
                  title="Index all rates into your vendor database"
                >
                  <Zap size={14} className="group-hover:animate-pulse" fill="currentColor" /> Bulk Index All Rates
                </button>
              )}
            </div>
          </>
          )}
        </div>
      </section>
    </main>

      {/* Save / Edit Metadata Modal */}
      <AnimatePresence>
        {isSaveModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4"
            >
              <div className="flex justify-between items-center pb-2 border-b">
                <h3 className="font-bold text-gray-900 uppercase tracking-widest text-sm flex items-center gap-2">
                  <ClipboardCheck size={18} className="text-orange-500" /> {isHistoryEditMode ? 'Edit Site Info' : 'Site Metadata'}
                </h3>
                <button onClick={() => setIsSaveModalOpen(false)} className="text-gray-400 hover:text-black transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4 pt-2">
                <div>
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-mono uppercase tracking-widest text-gray-400 font-bold block mb-1">Session Title</label>
                    {saveMetadata.title && (
                      <button onClick={() => setSaveMetadata(p => ({ ...p, title: '' }))} className="text-[9px] text-gray-300 hover:text-red-500 uppercase font-bold">Clear</button>
                    )}
                  </div>
                  <input 
                    type="text" 
                    value={saveMetadata.title}
                    onChange={e => setSaveMetadata(p => ({ ...p, title: e.target.value }))}
                    onFocus={e => e.target.select()}
                    placeholder="e.g. BOQ Morning Audit, Site Visit"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-mono uppercase tracking-widest text-gray-400 font-bold block mb-1">Address / Location</label>
                    {saveMetadata.address && (
                      <button onClick={() => setSaveMetadata(p => ({ ...p, address: '' }))} className="text-[9px] text-gray-300 hover:text-red-500 uppercase font-bold">Clear</button>
                    )}
                  </div>
                  <div className="relative group">
                    <History size={14} className="absolute left-3 top-3.5 text-gray-400" />
                    <input 
                      type="text" 
                      value={saveMetadata.address}
                      onChange={e => setSaveMetadata(p => ({ ...p, address: e.target.value }))}
                      placeholder="e.g. Sector 44, Gurgaon"
                      className="w-full pl-9 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm"
                    />
                    
                    {uniqueAddresses.length > 0 && !saveMetadata.address && (
                      <div className="mt-2 space-y-1">
                        <div className="text-[8px] font-mono uppercase tracking-widest text-gray-400 px-1">Recent Addresses</div>
                        <div className="flex flex-wrap gap-1.5">
                          {uniqueAddresses.slice(0, 5).map(addr => (
                            <button 
                              key={addr}
                              onClick={() => setSaveMetadata(p => ({ ...p, address: addr }))}
                              className="px-2 py-1 bg-gray-100 hover:bg-orange-100 text-[10px] text-gray-600 rounded-md transition-colors border border-gray-200 flex items-center gap-1"
                            >
                              <Truck size={8} /> {addr}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {saveMetadata.address && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-[60] overflow-hidden hidden group-focus-within:block">
                        {uniqueAddresses
                          .filter(a => a.toLowerCase().includes(saveMetadata.address.toLowerCase()) && a !== saveMetadata.address)
                          .map(a => (
                            <button
                              key={a}
                              onMouseDown={() => setSaveMetadata(p => ({ ...p, address: a }))}
                              className="w-full text-left px-4 py-2 text-xs hover:bg-orange-50 transition-colors border-b last:border-0 border-gray-100 flex items-center gap-2"
                            >
                              <Truck size={10} className="text-gray-400" /> {a}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-widest text-gray-400 font-bold block mb-1">Work Category</label>
                    <select 
                      value={saveMetadata.category}
                      onChange={e => setSaveMetadata(p => ({ ...p, category: e.target.value as any }))}
                      className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm font-bold"
                    >
                      {workCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-widest text-gray-400 font-bold block mb-1">Site Date</label>
                    <input 
                      type="date" 
                      value={saveMetadata.date}
                      onChange={e => setSaveMetadata(p => ({ ...p, date: e.target.value }))}
                      className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 flex flex-col gap-3">
                <div className="flex gap-3">
                  <button 
                    onClick={() => setIsSaveModalOpen(false)}
                    className="flex-1 py-3 bg-gray-100 text-gray-500 font-bold rounded-xl uppercase tracking-widest text-[10px] hover:bg-gray-200 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => confirmSaveToHistory(false)}
                    className="flex-[2] py-3 bg-black text-white font-bold rounded-xl uppercase tracking-widest text-[10px] hover:shadow-lg transition-all flex items-center justify-center gap-2"
                  >
                    <Save size={14} /> {isHistoryEditMode ? 'Update Existing Record' : 'Confirm Save'}
                  </button>
                </div>
                
                {isHistoryEditMode && (
                  <button 
                    onClick={() => confirmSaveToHistory(true)}
                    className="w-full py-3 bg-white border border-gray-200 text-gray-600 font-bold rounded-xl uppercase tracking-widest text-[10px] hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
                  >
                    <Copy size={14} /> Save as New Record
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Visual BOQ Preview Modal */}
      <AnimatePresence>
        {isPreviewOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-4 bg-black/80 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-5xl h-[90vh] rounded-2xl overflow-hidden flex flex-col shadow-2xl"
            >
              <div className="p-4 border-b flex items-center justify-between bg-gray-50 border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[var(--color-brand-primary)] text-white rounded-lg">
                    <FileCode size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold">Document Preview</h3>
                    <p className="text-[10px] text-gray-500 font-mono italic">Bill of Quantities • Instant Visual Mode</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => generatePDF(false)}
                    className="flex items-center gap-2 px-4 py-2 bg-[var(--color-brand-primary)] text-white text-xs font-bold rounded-lg hover:brightness-110 shadow-md shadow-orange-100"
                  >
                    <Download size={14} /> Download PDF
                  </button>
                  <button 
                    onClick={() => setIsPreviewOpen(false)}
                    className="p-2 hover:bg-gray-200 rounded-lg transition-colors text-gray-500"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="flex-1 bg-gray-100 p-2 md:p-8 overflow-y-auto">
                <div id="visual-pdf-preview" className="bg-white mx-auto max-w-[800px] shadow-2xl p-8 md:p-12 min-h-full rounded-sm flex flex-col gap-8 outline outline-1 outline-gray-200">
                  <div className="flex justify-between items-start">
                    <div>
                      <h1 className="text-3xl font-bold text-[var(--color-brand-primary)] mb-2">BILL OF QUANTITIES</h1>
                      <p className="text-xs text-gray-500 font-mono">ID: BOQ-{new Date().getTime().toString().slice(-6)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-gray-900 uppercase tracking-widest">Nirmaan Auditor</p>
                      <p className="text-[10px] text-gray-500">{new Date().toLocaleDateString()}</p>
                    </div>
                  </div>

                  <div className="flex-1">
                    <table className="w-full border-collapse border border-gray-900">
                      <thead>
                        <tr className="bg-gray-900 text-white text-[10px] uppercase tracking-wider font-mono">
                          <th className="border border-gray-900 p-2 text-left w-10">Sr.</th>
                          <th className="border border-gray-900 p-2 text-left">Description</th>
                          <th className="border border-gray-900 p-2 text-center w-20">Qty</th>
                          <th className="border border-gray-900 p-2 text-center w-20">Unit</th>
                          <th className="border border-gray-900 p-2 text-right w-32">Rate (₹)</th>
                          <th className="border border-gray-900 p-2 text-right w-32">Total (₹)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {boqItems.map((item, index) => (
                          <tr key={item.id} className="text-xs border-b border-gray-300">
                            <td className="border border-gray-300 p-2 text-center">{index + 1}</td>
                            <td className="border border-gray-300 p-2 font-medium">{item.item_name}</td>
                            <td className="border border-gray-300 p-2 text-center font-mono">{item.quantity}</td>
                            <td className="border border-gray-300 p-2 text-center">{item.unit}</td>
                            <td className="border border-gray-300 p-2 bg-gray-50/50"></td>
                            <td className="border border-gray-300 p-2 bg-gray-50/50"></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {generalNotes && (
                    <div className="border-l-2 border-orange-400 pl-4 py-2 bg-orange-50/20">
                      <h4 className="text-[10px] font-bold text-[var(--color-brand-primary)] uppercase tracking-wider mb-1">Specifications / Notes</h4>
                      <p className="text-[11px] text-gray-700 whitespace-pre-wrap leading-relaxed">{generalNotes}</p>
                    </div>
                  )}

                  <div className="mt-auto pt-8 border-t border-gray-100 italic text-[10px] text-gray-400">
                    <p>Note: Rate and Total columns are intentionally left blank for manual estimation or vendor quotes. This document was generated locally by Nirmaan Auditor.</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
