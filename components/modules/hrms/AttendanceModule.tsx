import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Edit3, Clock, Users, TrendingUp, AlertTriangle, Check, X, Plus, Download,
    ChevronLeft, ChevronRight, Calendar, Save, Loader2, Eye, Search, BarChart3
} from 'lucide-react';
import { Employee } from '../../hrms/types';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';

type SubTab = 'OVERVIEW' | 'DAILY' | 'MONTHLY';

interface AttendanceModuleProps {
    employees: Employee[];
}

// ─── Helpers ────────────────────────────────────────────────────────────
const formatTime = (isoStr: string | null): string => {
    if (!isoStr) return '--:--';
    try {
        return new Date(isoStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } catch {
        // Fallback for plain HH:mm:ss strings
        if (isoStr.includes(':')) {
            const [h, m] = isoStr.split(':');
            const hour = parseInt(h);
            const ampm = hour >= 12 ? 'PM' : 'AM';
            return `${hour % 12 || 12}:${m} ${ampm}`;
        }
        return isoStr;
    }
};

const calcDuration = (checkIn: string | null, checkOut: string | null): number => {
    if (!checkIn || !checkOut) return 0;
    try {
        const d1 = new Date(checkIn);
        const d2 = new Date(checkOut);
        if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
        return Math.max(0, parseFloat(((d2.getTime() - d1.getTime()) / (1000 * 60 * 60)).toFixed(2)));
    } catch {
        return 0;
    }
};

const isWeekend = (date: Date): boolean => {
    const day = date.getDay();
    return day === 5 || day === 6; // Friday + Saturday (Qatar)
};

const statusColor = (status: string) => {
    switch (status) {
        case 'Present': return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800';
        case 'Absent': return 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800';
        case 'Half Day': return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800';
        case 'On Leave': return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800';
        case 'Weekend': return 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-zinc-800 dark:text-zinc-500 dark:border-zinc-700';
        default: return 'bg-slate-50 text-slate-400 border-slate-200 dark:bg-zinc-800/50 dark:text-zinc-500 dark:border-zinc-700';
    }
};

const statusDot = (status: string) => {
    switch (status) {
        case 'Present': return 'bg-emerald-500';
        case 'Absent': return 'bg-rose-500';
        case 'Half Day': return 'bg-amber-500';
        case 'On Leave': return 'bg-blue-500';
        case 'Weekend': return 'bg-slate-400';
        default: return 'bg-slate-300';
    }
};

// ─── Main Component ─────────────────────────────────────────────────────
export const AttendanceModule: React.FC<AttendanceModuleProps> = ({ employees }) => {
    const [subTab, setSubTab] = useState<SubTab>('OVERVIEW');
    const { user } = useAuth();
    const [companyId, setCompanyId] = useState<string>('');

    useEffect(() => {
        const fetchCompanyId = async () => {
            if (!user) return;
            const { data } = await supabase.from('profiles').select('company_id').eq('id', user.id).maybeSingle();
            if (data) setCompanyId(data.company_id);
        };
        fetchCompanyId();
    }, [user]);

    const activeEmployees = useMemo(() =>
        employees.filter(e => e.status === 'Active'), [employees]);

    return (
        <div className="p-8 h-full flex flex-col animate-page-enter">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 shrink-0 gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Attendance</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mt-1">
                        Manage and monitor employee attendance
                    </p>
                </div>
                {/* Sub-tab Toggle */}
                <div className="bg-slate-100 dark:bg-zinc-800 p-1 rounded-2xl flex gap-1">
                    {([
                        { id: 'OVERVIEW', label: 'Overview', icon: BarChart3 },
                        { id: 'DAILY', label: 'Daily', icon: Clock },
                        { id: 'MONTHLY', label: 'Monthly', icon: Calendar },
                    ] as { id: SubTab; label: string; icon: any }[]).map(t => (
                        <button
                            key={t.id}
                            onClick={() => setSubTab(t.id)}
                            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${subTab === t.id
                                ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-white shadow-sm'
                                : 'text-slate-500 dark:text-slate-400 hover:text-indigo-500'
                                }`}
                        >
                            <t.icon className="w-4 h-4" /> {t.label}
                        </button>
                    ))}
                </div>
            </header>

            <div className="flex-1 overflow-hidden">
                {subTab === 'OVERVIEW' && <OverviewTab employees={activeEmployees} companyId={companyId} />}
                {subTab === 'DAILY' && <DailyTab employees={activeEmployees} companyId={companyId} />}
                {subTab === 'MONTHLY' && <MonthlyTab employees={activeEmployees} companyId={companyId} />}
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════
// SUB-TAB 1: OVERVIEW
// ═══════════════════════════════════════════════════════════════════════
const OverviewTab: React.FC<{ employees: Employee[]; companyId: string }> = ({ employees, companyId }) => {
    const [records, setRecords] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const today = new Date().toISOString().split('T')[0];

    useEffect(() => {
        if (companyId) fetchToday();
    }, [companyId]);

    const fetchToday = async () => {
        setLoading(true);
        const { data } = await supabase.from('attendance')
            .select('*')
            .eq('company_id', companyId)
            .eq('date', today);
        setRecords(data || []);
        setLoading(false);
    };

    const stats = useMemo(() => {
        const present = records.filter(r => r.status === 'Present').length;
        const absent = records.filter(r => r.status === 'Absent').length;
        const half = records.filter(r => r.status === 'Half Day').length;
        const leave = records.filter(r => r.status === 'On Leave').length;
        const notMarked = employees.length - records.length;
        const avgHours = records.length > 0
            ? (records.reduce((sum, r) => sum + (r.total_hours || 0), 0) / records.length).toFixed(1)
            : '0.0';
        return { present, absent, half, leave, notMarked, avgHours, total: employees.length };
    }, [records, employees]);

    // Merge employees + records
    const merged = useMemo(() => {
        return employees.map(emp => {
            const rec = records.find(r => r.employee_id === emp.id);
            return {
                ...emp,
                attendance: rec || null,
                currentStatus: rec?.status || 'Not Marked'
            };
        });
    }, [employees, records]);

    return (
        <div className="h-full overflow-y-auto space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {[
                    { label: 'Total', value: stats.total, color: 'text-slate-700 dark:text-white', bg: 'bg-white dark:bg-zinc-900/70', icon: Users },
                    { label: 'Present', value: stats.present, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20', icon: Check },
                    { label: 'Absent', value: stats.absent, color: 'text-rose-600', bg: 'bg-rose-50 dark:bg-rose-900/20', icon: X },
                    { label: 'Half Day', value: stats.half, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20', icon: Clock },
                    { label: 'On Leave', value: stats.leave, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20', icon: Calendar },
                    { label: 'Not Marked', value: stats.notMarked, color: 'text-slate-500', bg: 'bg-slate-50 dark:bg-zinc-800', icon: AlertTriangle },
                ].map((card, i) => (
                    <div key={i} className={`${card.bg} rounded-2xl p-5 border border-white/60 dark:border-zinc-800 shadow-sm`}>
                        <div className="flex items-center justify-between mb-3">
                            <card.icon className={`w-5 h-5 ${card.color} opacity-60`} />
                        </div>
                        <p className={`text-3xl font-black ${card.color}`}>{card.value}</p>
                        <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-1">{card.label}</p>
                    </div>
                ))}
            </div>

            {/* Avg Hours Card */}
            <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-6 text-white flex items-center justify-between">
                <div>
                    <p className="text-sm font-bold uppercase tracking-wider opacity-80">Avg. Working Hours Today</p>
                    <p className="text-4xl font-black mt-1">{stats.avgHours} <span className="text-lg opacity-70">hrs</span></p>
                </div>
                <TrendingUp className="w-10 h-10 opacity-30" />
            </div>

            {/* Employee Status List */}
            <div className="bg-white/70 dark:bg-zinc-900/70 backdrop-blur-xl rounded-[2rem] border border-white/60 dark:border-zinc-800 shadow-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800">
                    <h3 className="font-bold text-slate-800 dark:text-white">Today's Status — {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
                </div>
                <div className="overflow-y-auto max-h-[400px]">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50/80 dark:bg-zinc-800/80 sticky top-0 z-10">
                            <tr>
                                <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Employee</th>
                                <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Check In</th>
                                <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Check Out</th>
                                <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Hours</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100/50 dark:divide-zinc-800/50">
                            {loading ? (
                                <tr><td colSpan={5} className="text-center py-10 text-slate-400"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></td></tr>
                            ) : merged.map(emp => (
                                <tr key={emp.id} className="hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-colors">
                                    <td className="px-6 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-zinc-700 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300 ring-2 ring-white dark:ring-zinc-800 overflow-hidden">
                                                {emp.avatar && !emp.avatar.includes('ui-avatars') ?
                                                    <img src={emp.avatar} className="w-full h-full object-cover" /> :
                                                    emp.name?.charAt(0) || '?'}
                                            </div>
                                            <div>
                                                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{emp.name}</span>
                                                <p className="text-[10px] text-slate-400">{emp.employee_code || ''}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-3">
                                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${statusColor(emp.currentStatus)}`}>
                                            {emp.currentStatus}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3 text-sm font-mono text-slate-600 dark:text-slate-400">{formatTime(emp.attendance?.check_in)}</td>
                                    <td className="px-6 py-3 text-sm font-mono text-slate-600 dark:text-slate-400">{formatTime(emp.attendance?.check_out)}</td>
                                    <td className="px-6 py-3 text-sm font-bold text-slate-800 dark:text-white">{emp.attendance?.total_hours ? `${emp.attendance.total_hours}h` : '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════
// SUB-TAB 2: DAILY ATTENDANCE
// ═══════════════════════════════════════════════════════════════════════
const DailyTab: React.FC<{ employees: Employee[]; companyId: string }> = ({ employees, companyId }) => {
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [records, setRecords] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    // Add / Edit Punch Modal
    const [showPunchModal, setShowPunchModal] = useState(false);
    const [punchTarget, setPunchTarget] = useState<any>(null); // employee + existing record
    const [punchForm, setPunchForm] = useState({ checkIn: '', checkOut: '', status: 'Present', reason: '' });
    const [saving, setSaving] = useState(false);

    const fetchDaily = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        const { data } = await supabase.from('attendance')
            .select('*')
            .eq('company_id', companyId)
            .eq('date', selectedDate);
        setRecords(data || []);
        setLoading(false);
    }, [companyId, selectedDate]);

    useEffect(() => { fetchDaily(); }, [fetchDaily]);

    const merged = useMemo(() => {
        const filtered = search
            ? employees.filter(e => e.name.toLowerCase().includes(search.toLowerCase()) || (e.employee_code || '').toLowerCase().includes(search.toLowerCase()))
            : employees;
        return filtered.map(emp => {
            const rec = records.find(r => r.employee_id === emp.id);
            return { ...emp, attendance: rec || null, currentStatus: rec?.status || 'Not Marked' };
        });
    }, [employees, records, search]);

    const openPunchModal = (emp: any) => {
        setPunchTarget(emp);
        setPunchForm({
            checkIn: emp.attendance?.check_in ? new Date(emp.attendance.check_in).toTimeString().slice(0, 5) : '',
            checkOut: emp.attendance?.check_out ? new Date(emp.attendance.check_out).toTimeString().slice(0, 5) : '',
            status: emp.attendance?.status || 'Present',
            reason: ''
        });
        setShowPunchModal(true);
    };

    const handleSavePunch = async () => {
        if (!punchTarget || !companyId) return;
        setSaving(true);

        const checkInTs = punchForm.checkIn ? new Date(`${selectedDate}T${punchForm.checkIn}:00`).toISOString() : null;
        const checkOutTs = punchForm.checkOut ? new Date(`${selectedDate}T${punchForm.checkOut}:00`).toISOString() : null;
        const duration = calcDuration(checkInTs, checkOutTs);

        const { data: { user } } = await supabase.auth.getUser();

        if (punchTarget.attendance) {
            // UPDATE existing record
            await supabase.from('attendance').update({
                check_in: checkInTs,
                check_out: checkOutTs,
                status: punchForm.status,
                total_hours: duration,
                edited_by: user?.id,
                edited_at: new Date().toISOString(),
                edit_reason: punchForm.reason || 'Manual edit',
                source: 'manual'
            }).eq('id', punchTarget.attendance.id);
        } else {
            // INSERT new record
            await supabase.from('attendance').insert([{
                company_id: companyId,
                employee_id: punchTarget.id,
                date: selectedDate,
                check_in: checkInTs,
                check_out: checkOutTs,
                status: punchForm.status,
                total_hours: duration,
                source: 'manual',
                notes: punchForm.reason || null
            }]);
        }

        setShowPunchModal(false);
        setSaving(false);
        fetchDaily();
    };

    const handleMarkAllPresent = async () => {
        if (!companyId || !confirm('Mark all employees as Present for ' + selectedDate + '?')) return;
        const unmarked = employees.filter(emp => !records.find(r => r.employee_id === emp.id));
        if (unmarked.length === 0) { alert('All employees already have records.'); return; }

        const now = new Date().toISOString();
        const inserts = unmarked.map(emp => ({
            company_id: companyId,
            employee_id: emp.id,
            date: selectedDate,
            status: 'Present',
            total_hours: 0,
            source: 'manual'
        }));

        const { error } = await supabase.from('attendance').insert(inserts);
        if (error) alert('Error: ' + error.message);
        else fetchDaily();
    };

    const handleExportCSV = () => {
        const headers = ['Employee', 'Code', 'Date', 'Check In', 'Check Out', 'Status', 'Hours'];
        const rows = merged.map(m => [
            `"${m.name}"`,
            m.employee_code || '',
            selectedDate,
            formatTime(m.attendance?.check_in),
            formatTime(m.attendance?.check_out),
            m.currentStatus,
            m.attendance?.total_hours || 0
        ].join(','));
        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", `attendance_${selectedDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="h-full flex flex-col">
            {/* Controls Bar */}
            <div className="flex flex-wrap items-center gap-3 mb-5 shrink-0">
                <input
                    type="date"
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    className="px-4 py-2.5 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl text-sm font-bold text-slate-600 dark:text-slate-300 shadow-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
                <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search employee..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-700 dark:text-slate-300"
                    />
                </div>
                <div className="ml-auto flex gap-2">
                    <button onClick={handleExportCSV} className="px-4 py-2.5 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl text-sm font-bold text-slate-600 dark:text-slate-300 shadow-sm hover:border-indigo-300 hover:text-indigo-600 transition-all flex items-center gap-2">
                        <Download className="w-4 h-4" /> Export
                    </button>
                    <button onClick={handleMarkAllPresent} className="px-4 py-2.5 bg-indigo-600 text-white rounded-2xl text-sm font-bold shadow-lg shadow-indigo-500/30 hover:bg-indigo-700 transition-all flex items-center gap-2">
                        <Check className="w-4 h-4" /> Mark All Present
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-xl rounded-[2rem] border border-white/60 dark:border-zinc-800 shadow-xl overflow-hidden flex flex-col">
                <div className="flex-1 overflow-y-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50/80 dark:bg-zinc-800/80 sticky top-0 backdrop-blur-sm z-10 border-b border-slate-200/60 dark:border-zinc-700">
                            <tr>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Employee</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Check In</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Check Out</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Duration</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100/50 dark:divide-zinc-800/50">
                            {loading ? (
                                <tr><td colSpan={6} className="text-center py-10"><Loader2 className="w-5 h-5 mx-auto animate-spin text-slate-400" /></td></tr>
                            ) : merged.map(emp => (
                                <tr key={emp.id} className="hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-colors">
                                    <td className="px-6 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-zinc-700 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300 ring-2 ring-white dark:ring-zinc-800 overflow-hidden">
                                                {emp.avatar && !emp.avatar.includes('ui-avatars') ?
                                                    <img src={emp.avatar} className="w-full h-full object-cover" /> :
                                                    emp.name?.charAt(0)}
                                            </div>
                                            <div>
                                                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{emp.name}</span>
                                                <p className="text-[10px] text-slate-400">{emp.employee_code || ''}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-3 text-sm font-mono text-slate-600 dark:text-slate-400">{formatTime(emp.attendance?.check_in)}</td>
                                    <td className="px-6 py-3 text-sm font-mono text-slate-600 dark:text-slate-400">{formatTime(emp.attendance?.check_out)}</td>
                                    <td className="px-6 py-3 text-sm font-bold text-slate-800 dark:text-white">{emp.attendance?.total_hours ? `${emp.attendance.total_hours}h` : '-'}</td>
                                    <td className="px-6 py-3">
                                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${statusColor(emp.currentStatus)}`}>
                                            {emp.currentStatus}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3 text-right">
                                        <button
                                            onClick={() => openPunchModal(emp)}
                                            className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl transition-all"
                                            title={emp.attendance ? 'Edit Punch' : 'Add Punch'}
                                        >
                                            {emp.attendance ? <Edit3 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add/Edit Punch Modal */}
            {showPunchModal && punchTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-md animate-fade-in" onClick={() => setShowPunchModal(false)}>
                    <div className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden border border-white/50 dark:border-zinc-800 animate-slide-up" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-slate-100 dark:border-zinc-800 flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                                    {punchTarget.attendance ? 'Edit' : 'Add'} Attendance
                                </h3>
                                <p className="text-sm text-slate-500 mt-1">{punchTarget.name} — {selectedDate}</p>
                            </div>
                            <button onClick={() => setShowPunchModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl">
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>
                        <div className="p-6 space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Check In</label>
                                    <input type="time" value={punchForm.checkIn} onChange={e => setPunchForm({ ...punchForm, checkIn: e.target.value })}
                                        className="w-full p-3 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-mono text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none text-slate-900 dark:text-white" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Check Out</label>
                                    <input type="time" value={punchForm.checkOut} onChange={e => setPunchForm({ ...punchForm, checkOut: e.target.value })}
                                        className="w-full p-3 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-mono text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none text-slate-900 dark:text-white" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Status</label>
                                <select value={punchForm.status} onChange={e => setPunchForm({ ...punchForm, status: e.target.value })}
                                    className="w-full p-3 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none text-slate-900 dark:text-white">
                                    <option value="Present">Present</option>
                                    <option value="Absent">Absent</option>
                                    <option value="Half Day">Half Day</option>
                                    <option value="On Leave">On Leave</option>
                                </select>
                            </div>
                            {punchTarget.attendance && (
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Edit Reason</label>
                                    <textarea value={punchForm.reason} onChange={e => setPunchForm({ ...punchForm, reason: e.target.value })}
                                        placeholder="Why are you editing this record?"
                                        className="w-full p-3 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none h-20 resize-none text-slate-900 dark:text-white" />
                                </div>
                            )}
                            <button onClick={handleSavePunch} disabled={saving}
                                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-indigo-500/30 hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-70">
                                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5" /> Save Record</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════
// SUB-TAB 3: MONTHLY CALENDAR
// ═══════════════════════════════════════════════════════════════════════
const MonthlyTab: React.FC<{ employees: Employee[]; companyId: string }> = ({ employees, companyId }) => {
    const [selectedEmpId, setSelectedEmpId] = useState<string>(employees[0]?.id || '');
    const [currentMonth, setCurrentMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [records, setRecords] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Edit Modal
    const [editDay, setEditDay] = useState<number | null>(null);
    const [editForm, setEditForm] = useState({ checkIn: '', checkOut: '', status: 'Present', reason: '' });
    const [saving, setSaving] = useState(false);

    const fetchMonth = useCallback(async () => {
        if (!companyId || !selectedEmpId) return;
        setLoading(true);
        const [year, month] = currentMonth.split('-').map(Number);
        const startDate = `${currentMonth}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${currentMonth}-${String(lastDay).padStart(2, '0')}`;

        const { data } = await supabase.from('attendance')
            .select('*')
            .eq('company_id', companyId)
            .eq('employee_id', selectedEmpId)
            .gte('date', startDate)
            .lte('date', endDate)
            .order('date');
        setRecords(data || []);
        setLoading(false);
    }, [companyId, selectedEmpId, currentMonth]);

    useEffect(() => { fetchMonth(); }, [fetchMonth]);

    const selectedEmp = employees.find(e => e.id === selectedEmpId);

    // Build calendar grid
    const calendarData = useMemo(() => {
        const [year, month] = currentMonth.split('-').map(Number);
        const daysInMonth = new Date(year, month, 0).getDate();
        const firstDayOfWeek = new Date(year, month - 1, 1).getDay(); // 0=Sun
        // Shift so Monday=0: (day+6)%7
        const startOffset = (firstDayOfWeek + 6) % 7;

        const days: { day: number; date: Date; record: any; isWeekend: boolean }[] = [];
        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(year, month - 1, d);
            const dateStr = `${currentMonth}-${String(d).padStart(2, '0')}`;
            const record = records.find(r => r.date === dateStr);
            days.push({ day: d, date, record: record || null, isWeekend: isWeekend(date) });
        }
        return { days, startOffset, daysInMonth };
    }, [currentMonth, records]);

    const monthStats = useMemo(() => {
        const present = records.filter(r => r.status === 'Present').length;
        const absent = records.filter(r => r.status === 'Absent').length;
        const half = records.filter(r => r.status === 'Half Day').length;
        const leave = records.filter(r => r.status === 'On Leave').length;
        const totalHours = records.reduce((sum, r) => sum + (r.total_hours || 0), 0);
        return { present, absent, half, leave, totalHours: totalHours.toFixed(1) };
    }, [records]);

    const prevMonth = () => {
        const [y, m] = currentMonth.split('-').map(Number);
        const d = new Date(y, m - 2, 1);
        setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    };

    const nextMonth = () => {
        const [y, m] = currentMonth.split('-').map(Number);
        const d = new Date(y, m, 1);
        setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    };

    const openEditDay = (dayData: any) => {
        setEditDay(dayData.day);
        setEditForm({
            checkIn: dayData.record?.check_in ? new Date(dayData.record.check_in).toTimeString().slice(0, 5) : '',
            checkOut: dayData.record?.check_out ? new Date(dayData.record.check_out).toTimeString().slice(0, 5) : '',
            status: dayData.record?.status || (dayData.isWeekend ? 'Weekend' : 'Present'),
            reason: ''
        });
    };

    const handleSaveDay = async () => {
        if (editDay === null || !companyId || !selectedEmpId) return;
        setSaving(true);

        const dateStr = `${currentMonth}-${String(editDay).padStart(2, '0')}`;
        const checkInTs = editForm.checkIn ? new Date(`${dateStr}T${editForm.checkIn}:00`).toISOString() : null;
        const checkOutTs = editForm.checkOut ? new Date(`${dateStr}T${editForm.checkOut}:00`).toISOString() : null;
        const duration = calcDuration(checkInTs, checkOutTs);
        const { data: { user } } = await supabase.auth.getUser();

        const existing = records.find(r => r.date === dateStr);

        if (existing) {
            await supabase.from('attendance').update({
                check_in: checkInTs,
                check_out: checkOutTs,
                status: editForm.status,
                total_hours: duration,
                edited_by: user?.id,
                edited_at: new Date().toISOString(),
                edit_reason: editForm.reason || 'Calendar edit',
                source: 'manual'
            }).eq('id', existing.id);
        } else {
            await supabase.from('attendance').insert([{
                company_id: companyId,
                employee_id: selectedEmpId,
                date: dateStr,
                check_in: checkInTs,
                check_out: checkOutTs,
                status: editForm.status,
                total_hours: duration,
                source: 'manual',
                notes: editForm.reason || null
            }]);
        }

        setEditDay(null);
        setSaving(false);
        fetchMonth();
    };

    const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const [yearNum, monthNum] = currentMonth.split('-').map(Number);
    const monthName = new Date(yearNum, monthNum - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Controls */}
            <div className="flex flex-wrap items-center gap-4 mb-5 shrink-0">
                {/* Employee Selector */}
                <select
                    value={selectedEmpId}
                    onChange={e => setSelectedEmpId(e.target.value)}
                    className="px-4 py-2.5 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl text-sm font-bold text-slate-700 dark:text-slate-300 shadow-sm outline-none focus:ring-2 focus:ring-indigo-500/20 max-w-xs"
                >
                    {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.name} {emp.employee_code ? `(${emp.employee_code})` : ''}</option>
                    ))}
                </select>

                {/* Month Nav */}
                <div className="flex items-center gap-2 ml-auto">
                    <button onClick={prevMonth} className="p-2.5 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors">
                        <ChevronLeft className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                    </button>
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300 min-w-[140px] text-center">{monthName}</span>
                    <button onClick={nextMonth} className="p-2.5 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors">
                        <ChevronRight className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                    </button>
                </div>
            </div>

            {/* Monthly Stats */}
            <div className="grid grid-cols-5 gap-3 mb-5 shrink-0">
                {[
                    { label: 'Present', value: monthStats.present, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
                    { label: 'Absent', value: monthStats.absent, color: 'text-rose-600', bg: 'bg-rose-50 dark:bg-rose-900/20' },
                    { label: 'Half Day', value: monthStats.half, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20' },
                    { label: 'On Leave', value: monthStats.leave, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
                    { label: 'Total Hrs', value: monthStats.totalHours, color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
                ].map((s, i) => (
                    <div key={i} className={`${s.bg} rounded-2xl p-4 text-center`}>
                        <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">{s.label}</p>
                    </div>
                ))}
            </div>

            {/* Calendar Grid */}
            <div className="flex-1 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-xl rounded-[2rem] border border-white/60 dark:border-zinc-800 shadow-xl overflow-auto p-5">
                {loading ? (
                    <div className="h-full flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
                ) : (
                    <div>
                        {/* Week header */}
                        <div className="grid grid-cols-7 gap-2 mb-2">
                            {weekDays.map(d => (
                                <div key={d} className={`text-center text-[10px] font-bold uppercase tracking-widest py-2 ${d === 'Fri' || d === 'Sat' ? 'text-rose-400' : 'text-slate-400'}`}>{d}</div>
                            ))}
                        </div>
                        {/* Day cells */}
                        <div className="grid grid-cols-7 gap-2">
                            {/* Empty offset cells */}
                            {Array.from({ length: calendarData.startOffset }, (_, i) => (
                                <div key={`empty-${i}`} className="aspect-square" />
                            ))}
                            {/* Day cells */}
                            {calendarData.days.map(dayData => {
                                const st = dayData.record?.status || (dayData.isWeekend ? 'Weekend' : 'Not Marked');
                                const today = new Date();
                                const isToday = dayData.date.toDateString() === today.toDateString();
                                return (
                                    <button
                                        key={dayData.day}
                                        onClick={() => openEditDay(dayData)}
                                        className={`aspect-square rounded-xl border-2 flex flex-col items-center justify-center gap-0.5 transition-all hover:scale-105 hover:shadow-md cursor-pointer relative group
                                            ${isToday ? 'ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-zinc-900' : ''}
                                            ${st === 'Present' ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20' :
                                                st === 'Absent' ? 'border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-900/20' :
                                                    st === 'Half Day' ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20' :
                                                        st === 'On Leave' ? 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20' :
                                                            st === 'Weekend' ? 'border-slate-200 bg-slate-100 dark:border-zinc-700 dark:bg-zinc-800/50' :
                                                                'border-dashed border-slate-200 bg-white dark:border-zinc-700 dark:bg-zinc-900/30'
                                            }`}
                                    >
                                        <span className={`text-sm font-black ${st === 'Not Marked' || st === 'Weekend' ? 'text-slate-400 dark:text-zinc-500' : 'text-slate-700 dark:text-slate-200'}`}>
                                            {dayData.day}
                                        </span>
                                        <div className={`w-2 h-2 rounded-full ${statusDot(st)}`} />
                                        {/* Tooltip */}
                                        <div className="absolute bottom-full mb-2 hidden group-hover:block bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded-lg whitespace-nowrap z-20 pointer-events-none">
                                            {st}
                                            {dayData.record?.check_in && <> · {formatTime(dayData.record.check_in)}</>}
                                            {dayData.record?.check_out && <> - {formatTime(dayData.record.check_out)}</>}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        {/* Legend */}
                        <div className="flex flex-wrap gap-4 mt-5 pt-4 border-t border-slate-100 dark:border-zinc-800">
                            {[
                                { label: 'Present', color: 'bg-emerald-500' },
                                { label: 'Absent', color: 'bg-rose-500' },
                                { label: 'Half Day', color: 'bg-amber-500' },
                                { label: 'On Leave', color: 'bg-blue-500' },
                                { label: 'Weekend', color: 'bg-slate-400' },
                                { label: 'Not Marked', color: 'bg-slate-300' },
                            ].map(l => (
                                <div key={l.label} className="flex items-center gap-1.5">
                                    <div className={`w-2.5 h-2.5 rounded-full ${l.color}`} />
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{l.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Edit Day Modal */}
            {editDay !== null && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-md animate-fade-in" onClick={() => setEditDay(null)}>
                    <div className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden border border-white/50 dark:border-zinc-800 animate-slide-up" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-slate-100 dark:border-zinc-800 flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                                    {selectedEmp?.name} — {currentMonth}-{String(editDay).padStart(2, '0')}
                                </h3>
                                <p className="text-xs text-slate-500 mt-1">
                                    {new Date(yearNum, monthNum - 1, editDay).toLocaleDateString('en-US', { weekday: 'long' })}
                                </p>
                            </div>
                            <button onClick={() => setEditDay(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl"><X className="w-5 h-5 text-slate-500" /></button>
                        </div>
                        <div className="p-6 space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Check In</label>
                                    <input type="time" value={editForm.checkIn} onChange={e => setEditForm({ ...editForm, checkIn: e.target.value })}
                                        className="w-full p-3 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-mono text-sm outline-none text-slate-900 dark:text-white" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Check Out</label>
                                    <input type="time" value={editForm.checkOut} onChange={e => setEditForm({ ...editForm, checkOut: e.target.value })}
                                        className="w-full p-3 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-mono text-sm outline-none text-slate-900 dark:text-white" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Status</label>
                                <select value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                                    className="w-full p-3 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm outline-none text-slate-900 dark:text-white">
                                    <option value="Present">Present</option>
                                    <option value="Absent">Absent</option>
                                    <option value="Half Day">Half Day</option>
                                    <option value="On Leave">On Leave</option>
                                    <option value="Weekend">Weekend</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Notes / Reason</label>
                                <textarea value={editForm.reason} onChange={e => setEditForm({ ...editForm, reason: e.target.value })}
                                    placeholder="Optional notes..."
                                    className="w-full p-3 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm outline-none h-20 resize-none text-slate-900 dark:text-white" />
                            </div>
                            <button onClick={handleSaveDay} disabled={saving}
                                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-indigo-500/30 hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-70">
                                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5" /> Save</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
