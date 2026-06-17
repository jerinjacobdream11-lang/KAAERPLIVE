import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { Plus, Search, Filter, FileText, CheckCircle, Clock } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { PrintButton } from '../../ui/PrintButton';


export const Invoices: React.FC = () => {
    const { currentCompanyId } = useAuth();
    const [invoices, setInvoices] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Masters for Create Modal
    const [partners, setPartners] = useState<any[]>([]);
    const [items, setItems] = useState<any[]>([]);
    const [journals, setJournals] = useState<any[]>([]); // To select Sales Journal
    const [costCenters, setCostCenters] = useState<any[]>([]);
    const [salesLedgers, setSalesLedgers] = useState<any[]>([]);
    const [arAccount, setArAccount] = useState<any>(null);

    // Form State
    const [selectedPartner, setSelectedPartner] = useState('');
    const [selectedJournal, setSelectedJournal] = useState('');
    const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
    const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);

    // Line Items
    const [lines, setLines] = useState<any[]>([{ item_id: '', quantity: 1, unit_price: 0, cost_center_id: '', project_cost_center_id: '', contract_cost_center_id: '', sales_ledger_id: '' }]);

    useEffect(() => {
        if (currentCompanyId) {
            fetchInvoices();
            fetchMasters();
        }
    }, [currentCompanyId]);

    const fetchInvoices = async () => {
        if (!currentCompanyId) return;
        setLoading(true);
        const { data, error } = await supabase
            .from('accounting_journal_entries')
            .select(`
                *,
                partner:accounting_partners(name),
                journal:accounting_journals(code)
            `)
            .eq('company_id', currentCompanyId)
            .eq('move_type', 'out_invoice')
            .order('date', { ascending: false });

        if (error) console.error(error);
        else setInvoices(data || []);
        setLoading(false);
    };

    const fetchMasters = async () => {
        if (!currentCompanyId) return;
        const { data: pData } = await supabase
            .from('accounting_partners')
            .select('id, name, credit_limit, property_account_receivable_id')
            .eq('company_id', currentCompanyId)
            .or('partner_type.eq.Customer,partner_type.eq.Both');
        setPartners(pData || []);

        const { data: iData } = await supabase.from('item_master').select('id, name, code, income_account_id').eq('company_id', currentCompanyId);
        setItems(iData || []);

        const { data: jData } = await supabase.from('accounting_journals').select('id, name').eq('company_id', currentCompanyId).eq('type', 'Sale');
        setJournals(jData || []);
        if (jData && jData.length > 0) setSelectedJournal(jData[0].id);

        const { data: ccData } = await supabase.from('accounting_cost_centers').select('id, name, code, type').eq('company_id', currentCompanyId).eq('is_active', true);
        setCostCenters(ccData || []);

        const { data: slData } = await supabase.from('accounting_sales_ledgers').select('id, name').eq('company_id', currentCompanyId).eq('is_active', true);
        setSalesLedgers(slData || []);

        // Load new Accounts Receivable account for credit limit check
        const { data: arData } = await supabase
            .from('accounting_chart_of_accounts')
            .select('id')
            .eq('company_id', currentCompanyId)
            .eq('subtype', 'Receivable')
            .limit(1)
            .maybeSingle();
        if (arData) setArAccount(arData);
    };

    const handleAddLine = () => {
        setLines([...lines, { item_id: '', quantity: 1, unit_price: 0, cost_center_id: '', project_cost_center_id: '', contract_cost_center_id: '', sales_ledger_id: '' }]);
    };

    const handleLineChange = (index: number, field: string, value: any) => {
        const newLines = [...lines];
        newLines[index][field] = value;
        setLines(newLines);
    };

    const handleCreateInvoice = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (!selectedPartner || !selectedJournal) throw new Error('Missing required fields');

            // Credit Limit Check
            const partner = partners.find(p => p.id === selectedPartner);
            if (partner && partner.credit_limit > 0 && arAccount) {
                // Get current balance in new tables
                const { data: balanceData } = await supabase.rpc('rpc_get_accounting_account_balance', {
                    p_account_id: arAccount.id,
                    p_date: new Date().toISOString().split('T')[0],
                    p_partner_id: partner.id
                });
                
                const currentBalance = Number(balanceData || 0);
                const invoiceTotal = lines.reduce((acc, l) => acc + (Number(l.quantity) * Number(l.unit_price)), 0);
                
                if (currentBalance + invoiceTotal > partner.credit_limit) {
                    if (!confirm(`Warning: This invoice will put the customer over their credit limit of QAR ${partner.credit_limit}. Current Balance: QAR ${currentBalance}. Proceed?`)) {
                        return;
                    }
                }
            }

            const payload = {
                p_partner_id: selectedPartner,
                p_journal_id: selectedJournal,
                p_date: invoiceDate,
                p_due_date: dueDate,
                p_move_type: 'out_invoice',
                p_lines: lines.map(l => ({
                    item_id: l.item_id || null,
                    quantity: Number(l.quantity),
                    unit_price: Number(l.unit_price),
                    cost_center_id: l.cost_center_id || null,
                    project_cost_center_id: l.project_cost_center_id || null,
                    contract_cost_center_id: l.contract_cost_center_id || null,
                    sales_ledger_id: l.sales_ledger_id || null
                }))
            };

            const { data, error } = await supabase.rpc('rpc_create_accounting_invoice', payload);

            if (error) throw error;

            alert('Invoice Created! ID: ' + data);
            setIsModalOpen(false);
            setLines([{ item_id: '', quantity: 1, unit_price: 0, cost_center_id: '', project_cost_center_id: '', contract_cost_center_id: '', sales_ledger_id: '' }]);
            fetchInvoices();

        } catch (err: any) {
            console.error(err);
            alert('Error creating invoice: ' + err.message);
        }
    };

    const handlePost = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('Confirm Post? This will lock the invoice.')) return;

        const { data, error } = await supabase.rpc('rpc_post_accounting_entry', { 
            p_entry_id: id
        });
        if (error) alert('Error posting: ' + error.message);
        else {
            const res = data as any;
            if (res?.success) alert('Posted Successfully');
            else alert('Post Failed: ' + (res?.message || 'Unknown error'));
            fetchInvoices();
        }
    };

    const genericCC = costCenters.filter(cc => cc.type === 'GENERIC');
    const projectCC = costCenters.filter(cc => cc.type === 'PROJECT');
    const contractCC = costCenters.filter(cc => cc.type === 'CONTRACT');

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Customer Invoices</h2>
                <div className="flex items-center gap-3 no-print">
                    <PrintButton />
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        New Invoice
                    </button>
                </div>
            </div>

            {/* List */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 dark:bg-zinc-800/50 text-slate-500 font-medium">
                        <tr>
                            <th className="px-6 py-4">Number</th>
                            <th className="px-6 py-4">Customer</th>
                            <th className="px-6 py-4">Date</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4 text-right">Total</th>
                            <th className="px-6 py-4 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                        {loading ? (
                            <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">Loading...</td></tr>
                        ) : invoices.map(inv => (
                            <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors">
                                <td className="px-6 py-4 font-bold text-slate-700 dark:text-slate-300">
                                    {inv.reference || `INV-${inv.id.slice(0, 5).toUpperCase()}`}
                                </td>
                                <td className="px-6 py-4">{inv.partner?.name}</td>
                                <td className="px-6 py-4 text-slate-500">{inv.date}</td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${inv.state === 'Posted'
                                             ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                             : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                        }`}>
                                        {inv.state === 'Posted' ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                        {inv.state}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right font-bold text-slate-800 dark:text-white">
                                    QAR {Number(inv.amount_total).toFixed(2)}
                                </td>
                                <td className="px-6 py-4 text-center">
                                    {inv.state === 'Draft' && (
                                        <button
                                            onClick={(e) => handlePost(inv.id, e)}
                                            className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                                        >
                                            POST
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Create Modal */}
            {isModalOpen && (
                <Modal title="Create Customer Invoice" onClose={() => setIsModalOpen(false)} maxWidth="5xl">
                    <form onSubmit={handleCreateInvoice} className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Customer</label>
                                <select
                                    required
                                    value={selectedPartner}
                                    onChange={e => setSelectedPartner(e.target.value)}
                                    className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg text-sm"
                                >
                                    <option value="">Select Customer</option>
                                    {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Journal</label>
                                <select
                                    required
                                    value={selectedJournal}
                                    onChange={e => setSelectedJournal(e.target.value)}
                                    className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg text-sm"
                                >
                                    <option value="">Select Journal</option>
                                    {journals.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Invoice Date</label>
                                <input type="date" required value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Due Date</label>
                                <input type="date" required value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg text-sm" />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <h4 className="font-bold text-sm text-slate-700 dark:text-slate-300">Invoice Lines</h4>
                            </div>

                            <div className="bg-slate-50 dark:bg-zinc-800/50 rounded-xl p-4 space-y-3">
                                {lines.map((line, idx) => (
                                    <div key={idx} className="flex flex-wrap md:flex-nowrap gap-2 items-end border-b border-slate-100 dark:border-zinc-800 pb-3 md:pb-0 md:border-b-0">
                                        <div className="w-full md:flex-1 min-w-[150px]">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Item</label>
                                            <select
                                                value={line.item_id}
                                                onChange={e => handleLineChange(idx, 'item_id', e.target.value)}
                                                className="w-full p-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-md text-sm"
                                            >
                                                <option value="">Select Item</option>
                                                {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                                            </select>
                                        </div>
                                        <div className="w-full md:w-48">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Sales Ledger</label>
                                            <select
                                                required={!line.item_id}
                                                value={line.sales_ledger_id}
                                                onChange={e => handleLineChange(idx, 'sales_ledger_id', e.target.value)}
                                                className="w-full p-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-md text-sm"
                                            >
                                                <option value="">Select Sales Ledger</option>
                                                {salesLedgers.map(sl => <option key={sl.id} value={sl.id}>{sl.name}</option>)}
                                            </select>
                                        </div>
                                        <div className="w-full md:w-36">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Project CC</label>
                                            <select
                                                value={line.project_cost_center_id}
                                                onChange={e => handleLineChange(idx, 'project_cost_center_id', e.target.value)}
                                                className="w-full p-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-md text-sm"
                                            >
                                                <option value="">None</option>
                                                {projectCC.map(cc => <option key={cc.id} value={cc.id}>{cc.code}</option>)}
                                            </select>
                                        </div>
                                        <div className="w-full md:w-36">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Contract CC</label>
                                            <select
                                                value={line.contract_cost_center_id}
                                                onChange={e => handleLineChange(idx, 'contract_cost_center_id', e.target.value)}
                                                className="w-full p-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-md text-sm"
                                            >
                                                <option value="">None</option>
                                                {contractCC.map(cc => <option key={cc.id} value={cc.id}>{cc.code}</option>)}
                                            </select>
                                        </div>
                                        <div className="w-full md:w-36">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Cost Center</label>
                                            <select
                                                value={line.cost_center_id}
                                                onChange={e => handleLineChange(idx, 'cost_center_id', e.target.value)}
                                                className="w-full p-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-md text-sm"
                                            >
                                                <option value="">None</option>
                                                {genericCC.map(cc => <option key={cc.id} value={cc.id}>{cc.code}</option>)}
                                            </select>
                                        </div>
                                        <div className="w-20">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Qty</label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={line.quantity}
                                                onChange={e => handleLineChange(idx, 'quantity', e.target.value)}
                                                className="w-full p-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-md text-sm"
                                            />
                                        </div>
                                        <div className="w-28">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Price</label>
                                            <div className="relative">
                                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold">QAR</span>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    value={line.unit_price}
                                                    onChange={e => handleLineChange(idx, 'unit_price', e.target.value)}
                                                    className="w-full pl-10 p-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-md text-sm"
                                                />
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const newLines = lines.filter((_, i) => i !== idx);
                                                setLines(newLines);
                                            }}
                                            className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-md mb-0.5"
                                        >
                                            &times;
                                        </button>
                                    </div>
                                ))}
                                <button type="button" onClick={handleAddLine} className="text-xs font-bold text-blue-600 hover:underline">+ Add Line</button>
                            </div>

                            <div className="flex justify-end text-right">
                                <div>
                                    <span className="text-xs text-slate-500 font-bold uppercase mr-4">Total</span>
                                    <span className="text-xl font-bold text-slate-800 dark:text-white">
                                        QAR {lines.reduce((acc, l) => acc + (Number(l.quantity) * Number(l.unit_price)), 0).toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-slate-200 dark:border-zinc-700">
                            <button className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20 transition-all">
                                Create Invoice
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
};
