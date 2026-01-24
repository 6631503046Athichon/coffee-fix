
import * as React from 'react';
import { useDataContext } from '../../hooks/useDataContext';
import { useAuth } from '../../contexts/AuthContext';
import { Farm, GAPLogEntry, UserRole } from '../../types';
import { PlusCircle, Filter, FileText, Printer, X, CheckCircle, Edit, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import DatePicker from '../common/DatePicker';
import Select from '../common/Select';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { PageHeader } from '../common/PageHeader';
import { Badge } from '../common/Badge';
import { Alert } from '../common/Alert';
import { generateGAPLogId } from '../../utils/idGenerator';
import { addGAPLog, updateGAPLog } from '../../services/gapLogService';

const ITEMS_PER_PAGE = 10;

const GAPComplianceHelper: React.FC = () => {
    const { data, setData } = useDataContext();
    const { currentUser } = useAuth();

    // Get active activity types
    const activeActivityTypes = data.activityTypes.filter(t => t.isActive);
    const defaultActivityType = activeActivityTypes.length > 0 ? activeActivityTypes[0].name : '';

    const [selectedFarmId, setSelectedFarmId] = React.useState('');
    const [activityType, setActivityType] = React.useState<string>(defaultActivityType);
    const [date, setDate] = React.useState(new Date().toISOString().substring(0, 10));
    const [productUsed, setProductUsed] = React.useState('');
    const [quantity, setQuantity] = React.useState('');
    const [notes, setNotes] = React.useState('');
    const [showSuccess, setShowSuccess] = React.useState(false);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [formError, setFormError] = React.useState<string | null>(null);

    const [plotFilter, setPlotFilter] = React.useState('All');
    const [activityFilter, setActivityFilter] = React.useState('All');
    const [isReportModalOpen, setIsReportModalOpen] = React.useState(false);
    const [currentPage, setCurrentPage] = React.useState(1);
    
    const [editingLog, setEditingLog] = React.useState<GAPLogEntry | null>(null);
    
    const reportContentRef = React.useRef<HTMLDivElement>(null);
    const formRef = React.useRef<HTMLDivElement>(null);

    const isAdmin = currentUser?.roles?.includes(UserRole.Admin) ?? false;

    const farmMap = React.useMemo(() => {
        const map = new Map<string, Farm>();
        data.farms.forEach(farm => map.set(farm.id, farm));
        return map;
    }, [data.farms]);

    // Get farms aligned with Farm Management (admins see all)
    const accessibleFarms = React.useMemo(() => {
        if (!currentUser) return [];
        if (isAdmin) return data.farms;
        return data.farms.filter(
            farm => farm.ownerUserId === currentUser.id || farm.farmerName === currentUser.name,
        );
    }, [currentUser, data.farms, isAdmin]);

    const buildFarmLabel = React.useCallback((farm: Farm) => {
        if (farm.name && farm.location) {
            return `${farm.name} • ${farm.location}`;
        }
        return farm.name ?? farm.location;
    }, []);

    const sortedAccessibleFarms = React.useMemo(
        () => [...accessibleFarms].sort((a, b) => buildFarmLabel(a).localeCompare(buildFarmLabel(b))),
        [accessibleFarms, buildFarmLabel],
    );

    const farmOptions = React.useMemo(
        () => sortedAccessibleFarms.map(farm => ({ value: farm.id, label: buildFarmLabel(farm) })),
        [sortedAccessibleFarms, buildFarmLabel],
    );

    const matchFarmIdFromLocation = React.useCallback(
        (location?: string) => {
            if (!location) return undefined;
            const normalized = location.toLowerCase();
            return accessibleFarms.find(farm => {
                const nameMatch = farm.name && normalized.includes(farm.name.toLowerCase());
                const locationMatch = farm.location && normalized.includes(farm.location.toLowerCase());
                return nameMatch || locationMatch;
            })?.id;
        },
        [accessibleFarms],
    );

    const canViewLog = React.useCallback(
        (log: GAPLogEntry) => {
            if (!currentUser) return false;
            if (isAdmin) return true;
            if (log.farmId) {
                return accessibleFarms.some(farm => farm.id === log.farmId);
            }
            return Boolean(matchFarmIdFromLocation(log.farmPlotLocation));
        },
        [accessibleFarms, currentUser, isAdmin, matchFarmIdFromLocation],
    );

    const farmFilterOptions = React.useMemo(() => {
        const legacyOptions = new Map<string, true>();
        data.gapLogs.forEach(log => {
            if (!log.farmId && log.farmPlotLocation && canViewLog(log)) {
                legacyOptions.set(log.farmPlotLocation, true);
            }
        });

        return [
            { value: 'All', label: 'All Farms' },
            ...sortedAccessibleFarms.map(farm => ({ value: farm.id, label: buildFarmLabel(farm) })),
            ...Array.from(legacyOptions.keys()).map(location => ({ value: location, label: `${location} (Legacy)` })),
        ];
    }, [sortedAccessibleFarms, data.gapLogs, canViewLog, buildFarmLabel]);

    const handleLogSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Prevent double submission
        if (isSubmitting) {
            return;
        }

        setFormError(null);
        setShowSuccess(false);

        if (!selectedFarmId) {
            setFormError('Please select a farm from Farm Management before logging an activity');
            return;
        }

        const selectedFarm = farmMap.get(selectedFarmId);
        if (!selectedFarm) {
            setFormError('Selected farm not found. Please refresh the page and try again.');
            return;
        }

        if (!activityType) {
            setFormError('Please select an activity type');
            return;
        }

        if (!productUsed.trim()) {
            setFormError('Please enter the product or method used');
            return;
        }

        if (!quantity.trim()) {
            setFormError('Please enter the quantity');
            return;
        }

        const farmLabel = buildFarmLabel(selectedFarm);
        setIsSubmitting(true);
        
        try {
            if (editingLog) {
                // Update existing log
                const logData: Partial<GAPLogEntry> = {
                    farmId: selectedFarm.id,
                    farmPlotLocation: farmLabel,
                    activityType,
                    date,
                    productUsed: productUsed.trim(),
                    quantity: quantity.trim(),
                    notes: notes.trim() || undefined,
                };
                const updatedLog = await updateGAPLog(editingLog.id, logData);
                setData(prev => ({
                    ...prev,
                    gapLogs: prev.gapLogs.map(log => log.id === editingLog.id ? updatedLog : log)
                }));
                setEditingLog(null);
            } else {
                // Create new log
                const logData: Partial<GAPLogEntry> = {
                    farmId: selectedFarm.id,
                    farmPlotLocation: farmLabel,
                    activityType,
                    date,
                    productUsed: productUsed.trim(),
                    quantity: quantity.trim(),
                    notes: notes.trim() || undefined,
                };
                const newLog = await addGAPLog(logData);
                
                // Update state with the new log
                setData(prev => ({ 
                    ...prev, 
                    gapLogs: [newLog, ...prev.gapLogs] 
                }));
            }
            
            // Reset form only on success
            setSelectedFarmId('');
            setActivityType(defaultActivityType);
            setDate(new Date().toISOString().substring(0, 10));
            setProductUsed('');
            setQuantity('');
            setNotes('');
            setFormError(null);
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (error: any) {
            console.error('Failed to save GAP log:', error);
            const errorMessage = error?.message || 'Failed to save GAP log. Please try again.';
            
            // Provide user-friendly error messages
            if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
                setFormError('Authentication failed. Please log in again and try submitting the form.');
            } else if (errorMessage.includes('timeout') || errorMessage.includes('not responding')) {
                setFormError('Connection timeout. Please check your internet connection and try again.');
            } else if (errorMessage.includes('Failed to fetch') || errorMessage.includes('network')) {
                setFormError('Cannot connect to server. Please ensure the backend server is running on port 3001.');
            } else if (errorMessage.includes('Activity type')) {
                setFormError(errorMessage);
            } else {
                setFormError(errorMessage);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEdit = (log: GAPLogEntry) => {
        setEditingLog(log);
        if (log.farmId) {
            setSelectedFarmId(log.farmId);
        } else {
            setSelectedFarmId(matchFarmIdFromLocation(log.farmPlotLocation) ?? '');
        }
        setActivityType(log.activityType);
        setDate(log.date);
        setProductUsed(log.productUsed);
        setQuantity(log.quantity);
        setNotes(log.notes);
        // Scroll to form
        setTimeout(() => {
            formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    };

    const handleCancelEdit = () => {
        setEditingLog(null);
        setSelectedFarmId('');
        setActivityType(defaultActivityType);
        setDate(new Date().toISOString().substring(0, 10));
        setProductUsed('');
        setQuantity('');
        setNotes('');
    };
    
    const handleDelete = (logId: string) => {
        if (confirm('Are you sure you want to delete this activity log?')) {
            setData(prev => ({
                ...prev,
                gapLogs: prev.gapLogs.filter(log => log.id !== logId)
            }));
        }
    };
    
    const filteredLogs = React.useMemo(() => {
        if (!currentUser) return [];

        return data.gapLogs.filter(log => {
            if (!canViewLog(log)) return false;
            const plotMatch =
                plotFilter === 'All'
                    ? true
                    : log.farmId === plotFilter || (!log.farmId && log.farmPlotLocation === plotFilter);
            const activityMatch = activityFilter === 'All' || log.activityType === activityFilter;
            return plotMatch && activityMatch;
        });
    }, [data.gapLogs, plotFilter, activityFilter, currentUser, canViewLog]);

    // Reset page when filters change
    React.useEffect(() => {
        setCurrentPage(1);
    }, [plotFilter, activityFilter]);

    const totalPages = Math.ceil(filteredLogs.length / ITEMS_PER_PAGE);
    const paginatedLogs = React.useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredLogs.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredLogs, currentPage]);

    const reportData = React.useMemo(() => {
        // fix: Explicitly type the initial value for the reduce function to ensure
        // TypeScript correctly infers the type of `reportData`.
        return filteredLogs.reduce((acc, log) => {
            const key = log.farmId ?? log.farmPlotLocation ?? 'Farm not specified';
            (acc[key] = acc[key] || []).push(log);
            return acc;
        }, {} as Record<string, GAPLogEntry[]>);
    }, [filteredLogs]);

    const handlePrint = () => {
        const printContents = reportContentRef.current?.innerHTML;
        const originalContents = document.body.innerHTML;
        const printWindow = window.open('', '', 'height=600,width=800');
        
        if (printWindow && printContents) {
            printWindow.document.write('<html><head><title>GAP Compliance Report</title>');
            printWindow.document.write('<style>body{font-family:sans-serif;line-height:1.5;}h1,h2,h3{margin-bottom:0.5rem;}table{width:100%;border-collapse:collapse;margin-top:1rem;}th,td{border:1px solid #ddd;padding:8px;text-align:left;}th{background-color:#f2f2f2;}</style>');
            printWindow.document.write('</head><body >');
            printWindow.document.write(printContents);
            printWindow.document.write('</body></html>');
            printWindow.document.close();
            printWindow.print();
        }
    };


    return (
        <div className="space-y-8 min-w-0 w-full overflow-hidden">
            <PageHeader
                title="GAP Compliance Helper"
                description="Log and report agricultural activities for certification."
                icon={<FileText className="h-7 w-7 text-green-600" />}
            />

                {/* Log New Activity Card */}
                <div ref={formRef} className="bg-white shadow-sm rounded-xl p-6 border border-gray-200">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-100 rounded-lg">
                                <PlusCircle className="h-5 w-5 text-emerald-600" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900">
                                {editingLog ? 'Edit Activity Log' : 'Log Activity'}
                            </h2>
                        </div>
                        {editingLog && (
                            <Button
                                type="button"
                                onClick={handleCancelEdit}
                                variant="outline"
                                icon={<X className="h-4 w-4" />}
                            >
                                Cancel
                            </Button>
                        )}
                    </div>

                    <form onSubmit={handleLogSubmit} className="space-y-5">
                        {/* Error Display */}
                        {formError && (
                            <Alert variant="error" className="mb-4">
                                {formError}
                            </Alert>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Farm/Plot *</label>
                                <Select
                                    value={selectedFarmId}
                                    onChange={(v) => setSelectedFarmId((v as string) || '')}
                                    options={farmOptions}
                                    placeholder={farmOptions.length ? 'Select farm...' : 'No farms available'}
                                    disabled={!farmOptions.length}
                                    colorTheme="emerald"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Activity Type *</label>
                                <Select
                                  value={activityType}
                                  onChange={(v) => setActivityType((v as string) || '')}
                                  options={activeActivityTypes.map(t => t.name)}
                                  placeholder="Select activity type..."
                                  colorTheme="emerald"
                                />
                            </div>
                            <div>
                                <DatePicker
                                    value={date}
                                    onChange={setDate}
                                    label="Date *"
                                    required
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input
                                label="Product/Method Used *"
                                type="text"
                                value={productUsed}
                                onChange={e => setProductUsed(e.target.value)}
                                required
                                placeholder="e.g. Organic fertilizer, Neem oil"
                                fullWidth
                            />
                            <Input
                                label="Quantity *"
                                type="text"
                                value={quantity}
                                onChange={e => setQuantity(e.target.value)}
                                required
                                placeholder="e.g. 200 kg, 5 liters, 2 hours"
                                fullWidth
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Notes</label>
                            <textarea
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                rows={4}
                                placeholder="Additional notes about this activity (optional)..."
                                className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all bg-white hover:border-gray-400 resize-none placeholder-gray-400 text-sm"
                            ></textarea>
                        </div>

                        <div className="flex items-center justify-between pt-2">
                            {showSuccess && (
                                <Alert variant="success" className="flex-1 mr-4">
                                    {editingLog ? 'Activity Log updated successfully!' : 'Activity Log saved successfully!'}
                                </Alert>
                            )}
                            <Button
                                type="submit"
                                variant="primary"
                                icon={isSubmitting ? undefined : (editingLog ? <CheckCircle className="h-4 w-4" /> : <PlusCircle className="h-4 w-4" />)}
                                className="ml-auto"
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? 'Saving...' : (editingLog ? 'Update Activity' : 'Save Activity')}
                            </Button>
                        </div>
                    </form>
                </div>

                {/* Activity Logs Table */}
                <div className="bg-white shadow-sm rounded-xl overflow-hidden border border-gray-200">
                    <div className="bg-gray-50 p-6 border-b border-gray-200 flex flex-wrap justify-between items-center gap-4">
                        <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                                <Filter className="h-4 w-4" />
                                Filter Logs:
                            </span>
                            <div className="w-48">
                                <Select
                                    value={plotFilter}
                                    onChange={(v) => setPlotFilter((v as string) || 'All')}
                                    options={farmFilterOptions}
                                    placeholder="All Farms"
                                />
                            </div>
                            <div className="w-48">
                                <Select
                                  value={activityFilter}
                                  onChange={(v) => setActivityFilter((v as string) || 'All')}
                                  options={['All', ...data.activityTypes.map(t => t.name)]}
                                  placeholder="All Types"
                                />
                            </div>
                        </div>
                        <Button
                            onClick={() => setIsReportModalOpen(true)}
                            variant="success"
                            icon={<FileText className="h-4 w-4" />}
                        >
                            Generate Report
                        </Button>
                    </div>

                    {filteredLogs.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                                <FileText className="h-8 w-8 text-gray-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Activity Logs yet</h3>
                            <p className="text-sm text-gray-500 mb-4">Start logging your agricultural activities to track GAP Compliance</p>
                        </div>
                    ) : (
                        <div className="overflow-hidden">
                            <div className="overflow-x-auto overflow-y-hidden">
                                <table className="w-full divide-y divide-gray-200 table-fixed">
                                    <thead className="bg-gray-900">
                                    <tr>
                                        <th scope="col" className="w-[18%] px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">Farm/Plot</th>
                                        <th scope="col" className="w-[10%] px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">Date</th>
                                        <th scope="col" className="w-[12%] px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">Type</th>
                                        <th scope="col" className="w-[18%] px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">Product/Method</th>
                                        <th scope="col" className="w-[10%] px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">Quantity</th>
                                        <th scope="col" className="w-[20%] px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">Notes</th>
                                        <th scope="col" className="w-[12%] px-4 py-3 text-center text-xs font-semibold text-white uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {paginatedLogs.map((log) => {
                                        const logFarm = log.farmId ? farmMap.get(log.farmId) : undefined;
                                        const primaryLabel = logFarm?.name ?? log.farmPlotLocation ?? 'Farm not specified';
                                        const secondaryLabel = logFarm?.location && logFarm?.name ? logFarm.location : undefined;
                                        return (
                                        <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3 text-sm">
                                                <div className="font-semibold text-gray-900">{primaryLabel}</div>
                                                {secondaryLabel && <div className="text-xs text-gray-500 mt-0.5">{secondaryLabel}</div>}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{log.date}</td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <Badge variant="primary">
                                                    {log.activityType}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-700 max-w-xs truncate" title={log.productUsed}>
                                                {log.productUsed}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{log.quantity}</td>
                                            <td className="px-4 py-3 text-sm text-gray-600 max-w-xs">
                                                {log.notes ? (
                                                    <span className="truncate block" title={log.notes}>{log.notes}</span>
                                                ) : (
                                                    <span className="text-gray-400">-</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-center">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <button
                                                        onClick={() => handleEdit(log)}
                                                        className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                                                        title="Edit"
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(log.id)}
                                                        className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                        );
                                    })}
                                </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="flex justify-center items-center px-4 py-3 bg-gray-50 border-t border-gray-200">
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                            disabled={currentPage === 1}
                                            className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-md disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                        </button>
                                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                            <button
                                                key={page}
                                                onClick={() => setCurrentPage(page)}
                                                className={`w-8 h-8 text-sm font-medium rounded-md transition-colors ${
                                                    currentPage === page
                                                        ? 'bg-blue-600 text-white'
                                                        : 'text-gray-700 hover:bg-gray-100'
                                                }`}
                                            >
                                                {page}
                                            </button>
                                        ))}
                                        <button
                                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                            disabled={currentPage === totalPages}
                                            className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-md disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                                        >
                                            <ChevronRight className="h-4 w-4" />
                                        </button>
                                    </div>
                                    <span className="ml-4 text-sm text-gray-500">
                                        Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredLogs.length)} of {filteredLogs.length}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

            <Modal
                isOpen={isReportModalOpen}
                onClose={() => setIsReportModalOpen(false)}
                title="GAP Compliance Report"
                maxWidth="5xl"
                showCloseButton={false}
            >
                <div className="flex items-center justify-end gap-2 mb-4">
                    <Button
                        onClick={handlePrint}
                        variant="primary"
                        icon={<Printer className="h-4 w-4" />}
                    >
                        Print
                    </Button>
                    <Button
                        onClick={() => setIsReportModalOpen(false)}
                        variant="outline"
                        icon={<X className="h-4 w-4" />}
                    >
                        Close
                    </Button>
                </div>

                <div ref={reportContentRef} className="overflow-y-auto pr-2 max-h-[70vh]">
                            <div className="bg-indigo-50 rounded-lg p-6 mb-6 border border-indigo-200">
                                <h1 className="text-xl font-bold text-gray-900 mb-2">Summary of Agricultural Practices</h1>
                                <p className="text-sm text-gray-600 flex items-center gap-2">
                                    <span className="font-semibold">Report generated on:</span>
                                    <span className="bg-white px-3 py-1 rounded-md border border-gray-200 text-gray-700">
                                        {new Date().toLocaleDateString()}
                                    </span>
                                </p>
                            </div>

                            {Object.entries(reportData).map(([groupKey, logs]: [string, GAPLogEntry[]]) => {
                                const reportFarm = farmMap.get(groupKey);
                                const displayLabel = reportFarm ? buildFarmLabel(reportFarm) : groupKey;
                                return (
                                <div key={groupKey} className="mb-6 bg-white rounded-lg shadow-sm p-6 border-l-4 border-indigo-500">
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                                            <span className="text-indigo-600 font-bold text-lg">📍</span>
                                        </div>
                                        <h2 className="text-lg font-bold text-gray-900">
                                            Plot: <span className="text-indigo-600">{displayLabel}</span>
                                        </h2>
                                    </div>

                                    {data.activityTypes.map(actType => {
                                        const typeLogs = logs.filter((l: GAPLogEntry) => l.activityType === actType.name);
                                        if (typeLogs.length === 0) return null;
                                        return (
                                            <div key={actType.id} className="mt-4 bg-gray-50 rounded-lg p-4 border border-gray-200">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                                                        {actType.name}
                                                    </span>
                                                    <span className="text-xs text-gray-500 font-medium">
                                                        ({typeLogs.length} {typeLogs.length === 1 ? 'entry' : 'entries'})
                                                    </span>
                                                </div>
                                                <div className="overflow-hidden rounded-lg border border-gray-200">
                                                    <div className="overflow-x-auto">
                                                        <table className="min-w-full text-sm">
                                                        <thead className="bg-gray-900">
                                                            <tr>
                                                                <th className="text-left px-4 py-4 font-bold text-white w-1/4 border-b border-gray-200 tracking-wider">Date</th>
                                                                <th className="text-left px-4 py-4 font-bold text-white w-1/2 border-b border-gray-200 tracking-wider">Product/Method</th>
                                                                <th className="text-left px-4 py-4 font-bold text-white w-1/4 border-b border-gray-200 tracking-wider">Quantity</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="bg-white">
                                                            {typeLogs.map((log, idx) => (
                                                                <tr key={log.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-indigo-50 transition-colors`}>
                                                                    <td className="px-4 py-2 border-b border-gray-100 text-gray-700">{log.date}</td>
                                                                    <td className="px-4 py-2 border-b border-gray-100 text-gray-800 font-medium">{log.productUsed}</td>
                                                                    <td className="px-4 py-2 border-b border-gray-100 text-gray-700 font-medium">{log.quantity}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                            })}
                        </div>
            </Modal>
        </div>
    );
};

export default GAPComplianceHelper;