
import * as React from 'react';
import { useDataContext } from '../../hooks/useDataContext';
import { GAPLogEntry } from '../../types';
import { PlusCircle, Filter, FileText, Printer, X, CheckCircle, Edit, Trash2 } from 'lucide-react';
import DatePicker from '../common/DatePicker';
import Select from '../common/Select';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { PageHeader } from '../common/PageHeader';
import { Badge } from '../common/Badge';
import { Alert } from '../common/Alert';
import { generateGAPLogId } from '../../utils/idGenerator';

const GAPComplianceHelper: React.FC = () => {
    const { data, setData } = useDataContext();

    // Get active activity types
    const activeActivityTypes = data.activityTypes.filter(t => t.isActive);
    const defaultActivityType = activeActivityTypes.length > 0 ? activeActivityTypes[0].name : '';

    const [farmPlotLocation, setFarmPlotLocation] = React.useState('');
    const [activityType, setActivityType] = React.useState<string>(defaultActivityType);
    const [date, setDate] = React.useState(new Date().toISOString().substring(0, 10));
    const [productUsed, setProductUsed] = React.useState('');
    const [quantity, setQuantity] = React.useState('');
    const [notes, setNotes] = React.useState('');
    const [showSuccess, setShowSuccess] = React.useState(false);

    const [plotFilter, setPlotFilter] = React.useState('All');
    const [activityFilter, setActivityFilter] = React.useState('All');
    const [isReportModalOpen, setIsReportModalOpen] = React.useState(false);
    
    const [editingLog, setEditingLog] = React.useState<GAPLogEntry | null>(null);
    
    const reportContentRef = React.useRef<HTMLDivElement>(null);
    const formRef = React.useRef<HTMLDivElement>(null);

    const uniquePlots = React.useMemo(() => {
        const plots = new Set(data.farms.map(f => f.location));
        return ['All', ...Array.from(plots).sort()];
    }, [data.farms]);

    const handleLogSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        if (editingLog) {
            // Update existing log
            setData(prev => ({
                ...prev,
                gapLogs: prev.gapLogs.map(log =>
                    log.id === editingLog.id
                        ? { ...log, farmPlotLocation, activityType, date, productUsed, quantity, notes }
                        : log
                )
            }));
            setEditingLog(null);
        } else {
            // Create new log
            const newLog: GAPLogEntry = {
                id: generateGAPLogId(data.gapLogs.map(log => log.id)),
                farmPlotLocation,
                activityType,
                date,
                productUsed,
                quantity,
                notes
            };
            setData(prev => ({ ...prev, gapLogs: [newLog, ...prev.gapLogs] }));
        }
        
        // Reset form
        setFarmPlotLocation('');
        setActivityType(defaultActivityType);
        setDate(new Date().toISOString().substring(0, 10));
        setProductUsed('');
        setQuantity('');
        setNotes('');
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
    };

    const handleEdit = (log: GAPLogEntry) => {
        setEditingLog(log);
        setFarmPlotLocation(log.farmPlotLocation);
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
        setFarmPlotLocation('');
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
        return data.gapLogs.filter(log => {
            const plotMatch = plotFilter === 'All' || log.farmPlotLocation === plotFilter;
            const activityMatch = activityFilter === 'All' || log.activityType === activityFilter;
            return plotMatch && activityMatch;
        });
    }, [data.gapLogs, plotFilter, activityFilter]);
    
    const reportData = React.useMemo(() => {
        // fix: Explicitly type the initial value for the reduce function to ensure
        // TypeScript correctly infers the type of `reportData`.
        return filteredLogs.reduce((acc, log) => {
            (acc[log.farmPlotLocation] = acc[log.farmPlotLocation] || []).push(log);
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
        <div className="space-y-8">
            <PageHeader
                title="GAP Compliance Helper"
                description="Log and report agricultural activities for certification."
                icon={FileText}
            />

                {/* Log New Activity Card */}
                <div ref={formRef} className="bg-white shadow-sm rounded-xl p-8 border border-gray-200">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-indigo-100 rounded-lg">
                                <PlusCircle className="h-5 w-5 text-indigo-600" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900">
                                {editingLog ? 'Edit Activity Log' : 'Activity Log'}
                            </h2>
                        </div>
                        {editingLog && (
                            <Button
                                type="button"
                                onClick={handleCancelEdit}
                                variant="outline"
                                icon={<X className="h-4 w-4" />}
                            >
                                Cancel Edit
                            </Button>
                        )}
                    </div>

                    <form onSubmit={handleLogSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Farm/Plot</label>
                                <Select
                                  value={farmPlotLocation}
                                  onChange={(v) => setFarmPlotLocation((v as string) || '')}
                                  options={uniquePlots.slice(1)}
                                  placeholder="Select a plot..."
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Activity Type</label>
                                <Select
                                  value={activityType}
                                  onChange={(v) => setActivityType((v as string) || '')}
                                  options={activeActivityTypes.map(t => t.name)}
                                  placeholder="Select activity type..."
                                />
                            </div>
                            <div>
                                <DatePicker
                                    value={date}
                                    onChange={setDate}
                                    label="Date"
                                    required
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Input
                                label="Product/Method Used"
                                type="text"
                                value={productUsed}
                                onChange={e => setProductUsed(e.target.value)}
                                required
                                placeholder="e.g., Organic Compost, Neem Oil"
                            />
                            <Input
                                label="Quantity"
                                type="text"
                                value={quantity}
                                onChange={e => setQuantity(e.target.value)}
                                required
                                placeholder="e.g., 200 kg, 5 L, 2 hours"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Notes</label>
                            <textarea
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                rows={4}
                                placeholder="Optional notes about this activity..."
                                className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all bg-white hover:border-gray-400 resize-none placeholder-gray-400"
                            ></textarea>
                        </div>

                        <div className="flex items-center justify-between pt-2">
                            {showSuccess && (
                                <Alert variant="success" className="flex-1 mr-4">
                                    {editingLog ? 'Activity updated successfully!' : 'Activity logged successfully!'}
                                </Alert>
                            )}
                            <Button
                                type="submit"
                                variant="primary"
                                icon={editingLog ? <CheckCircle className="h-4 w-4" /> : <PlusCircle className="h-4 w-4" />}
                                className="ml-auto"
                            >
                                {editingLog ? 'Update Activity' : 'Log Activity'}
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
                                  options={uniquePlots}
                                  placeholder="All Plots"
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

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-900">
                                <tr>
                                    <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Plot</th>
                                    <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Date</th>
                                    <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Type</th>
                                    <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Product/Method</th>
                                    <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Quantity</th>
                                    <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Notes</th>
                                    <th scope="col" className="px-6 py-4 text-center text-xs font-bold text-white uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                                {filteredLogs.map((log, idx) => (
                                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{log.farmPlotLocation}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{log.date}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <Badge variant="primary">
                                                {log.activityType}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{log.productUsed}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{log.quantity}</td>
                                        <td className="px-6 py-4 text-sm text-gray-600">{log.notes}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => handleEdit(log)}
                                                    className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                                                    title="Edit"
                                                >
                                                    <Edit className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(log.id)}
                                                    className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                                                    title="Delete"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
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

                            {Object.entries(reportData).map(([plot, logs]: [string, GAPLogEntry[]]) => (
                                <div key={plot} className="mb-6 bg-white rounded-lg shadow-sm p-6 border-l-4 border-indigo-500">
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                                            <span className="text-indigo-600 font-bold text-lg">📍</span>
                                        </div>
                                        <h2 className="text-lg font-bold text-gray-900">
                                            Plot: <span className="text-indigo-600">{plot}</span>
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
                                                <div className="overflow-x-auto">
                                                    <table className="min-w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
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
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
            </Modal>
        </div>
    );
};

export default GAPComplianceHelper;