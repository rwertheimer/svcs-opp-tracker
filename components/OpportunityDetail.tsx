
import React, { useMemo } from 'react';
import type { Opportunity, AccountDetails, SupportTicket, UsageData, ProjectHistory, Disposition } from '../types';
import Card from './Card';
import Tag from './Tag';
import DispositionForm from './DispositionForm';
import { ICONS } from '../constants';

interface OpportunityDetailProps {
  opportunity: Opportunity;
  details: AccountDetails;
  historicalOpportunities: Opportunity[];
  onBack: () => void;
  onSave: (disposition: Disposition) => void;
}

const formatCurrency = (amount: number) => {
    if (!amount) return '$0';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
};

const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    // Adjust for timezone to prevent date from shifting
    const utcDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
    return utcDate.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

// --- Sub-components defined outside the main component for performance ---

const SupportTickets: React.FC<{ tickets: SupportTicket[] }> = ({ tickets }) => {
    const sortedTickets = useMemo(() => {
        return [...tickets].sort((a, b) => new Date(b.tickets_created_date).getTime() - new Date(a.tickets_created_date).getTime());
    }, [tickets]);

    if (tickets.length === 0) {
        return <p className="text-slate-500 text-sm">No open support tickets.</p>;
    }
    
    return (
        <div className="overflow-x-auto max-h-96">
            <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-600 uppercase bg-slate-50 sticky top-0">
                    <tr>
                        <th className="px-4 py-2">Created Date</th>
                        <th className="px-4 py-2">Status</th>
                        <th className="px-4 py-2">Subject</th>
                        <th className="px-4 py-2 text-center">Days Open</th>
                        <th className="px-4 py-2">Priority</th>
                        <th className="px-4 py-2 text-center">Escalated</th>
                        <th className="px-4 py-2 text-center">Days Since Response</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                    {sortedTickets.map(ticket => (
                        <tr key={ticket.tickets_ticket_number} className="hover:bg-slate-50">
                            <td className="px-4 py-2 whitespace-nowrap">{formatDate(ticket.tickets_created_date)}</td>
                            <td className="px-4 py-2"><Tag status={ticket.tickets_status} /></td>
                            <td className="px-4 py-2 font-medium">
                                <a href={ticket.tickets_ticket_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                                    {ticket.tickets_subject}
                                </a>
                            </td>
                            <td className="px-4 py-2 text-center">{ticket.days_open}</td>
                            <td className="px-4 py-2"><Tag status={ticket.tickets_priority} /></td>
                            <td className="px-4 py-2 text-center"><Tag status={ticket.tickets_is_escalated} /></td>
                            <td className="px-4 py-2 text-center">{ticket.days_since_last_responce}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};


const UsageHistoryTable: React.FC<{ usage: UsageData[] }> = ({ usage }) => {
    const { pivotedData, months } = useMemo(() => {
        if (!usage || usage.length === 0) {
            return { pivotedData: [], months: [] };
        }

        const now = new Date();
        const monthStrings: string[] = [];
        for (let i = 0; i < 3; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            monthStrings.push(`${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`);
        }
        monthStrings.reverse(); // oldest to newest

        type PivotedRow = {
            key: string;
            integration: string;
            groupName: string;
            warehouseType: string;
            service: string;
            monthlyData: {
                [month: string]: { raw: number; billable: number; }
            }
        };

        const groupedData = usage.reduce((acc, item) => {
            const key = [
                item.connections_table_timeline_table_name,
                item.connections_group_name,
                item.connections_warehouse_subtype,
                item.connections_timeline_service_eom
            ].join('|');

            if (!acc[key]) {
                acc[key] = {
                    key,
                    integration: item.connections_table_timeline_table_name,
                    groupName: item.connections_group_name,
                    warehouseType: item.connections_warehouse_subtype,
                    service: item.connections_timeline_service_eom,
                    monthlyData: {}
                };
            }
            acc[key].monthlyData[item.accounts_timeline_date_month] = {
                raw: item.connections_table_timeline_raw_volume_updated,
                billable: item.connections_table_timeline_total_billable_volume
            };
            return acc;
        }, {} as Record<string, PivotedRow>);
        
        const pivotedArray = Object.values(groupedData);

        // Sort descending by the most recent month's billable volume
        const mostRecentMonth = monthStrings[2];
        pivotedArray.sort((a, b) => {
            const billableA = a.monthlyData[mostRecentMonth]?.billable || 0;
            const billableB = b.monthlyData[mostRecentMonth]?.billable || 0;
            return billableB - billableA;
        });

        return { pivotedData: pivotedArray, months: monthStrings };

    }, [usage]);

    const formatVolume = (volume: number) => {
        if (volume === 0 || !volume) return '-';
        if (volume < 1e6) return `${(volume / 1e3).toFixed(1)} K`;
        if (volume < 1e9) return `${(volume / 1e6).toFixed(1)} M`;
        if (volume < 1e12) return `${(volume / 1e9).toFixed(1)} B`;
        return `${(volume / 1e12).toFixed(1)} T`;
    }
    
    const getMonthName = (monthStr: string) => {
        const [year, month] = monthStr.split('-');
        return new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', { month: 'short' });
    }

    if (pivotedData.length === 0) {
        return <p className="text-slate-500 text-sm">No usage history available for this period.</p>;
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-600 uppercase bg-slate-50">
                    <tr>
                        <th className="px-4 py-2">Integration</th>
                        <th className="px-4 py-2">Group Name</th>
                        <th className="px-4 py-2">Warehouse</th>
                        <th className="px-4 py-2">Service</th>
                        {months.map(month => (
                            <th key={month + '-raw'} className="px-4 py-2 text-right border-l">{getMonthName(month)} Raw Vol.</th>
                        ))}
                        {months.map(month => (
                            <th key={month + '-billable'} className="px-4 py-2 text-right border-l font-bold">{getMonthName(month)} Billable Vol.</th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                    {pivotedData.map(row => (
                        <tr key={row.key} className="hover:bg-slate-50">
                            <td className="px-4 py-2 font-medium text-slate-800">{row.integration}</td>
                            <td className="px-4 py-2">{row.groupName}</td>
                            <td className="px-4 py-2"><Tag status={row.warehouseType} /></td>
                            <td className="px-4 py-2">{row.service}</td>
                            {months.map(month => (
                                <td key={month + '-raw'} className="px-4 py-2 text-right border-l">{formatVolume(row.monthlyData[month]?.raw)}</td>
                            ))}
                             {months.map(month => (
                                <td key={month + '-billable'} className="px-4 py-2 text-right border-l font-semibold text-indigo-700">{formatVolume(row.monthlyData[month]?.billable)}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const ProjectHistoryList: React.FC<{ projects: ProjectHistory[] }> = ({ projects }) => {
    if (projects.length === 0) {
        return <p className="text-slate-500 text-sm">No prior services projects.</p>;
    }

    const renderProgressBar = (project: ProjectHistory) => {
        const remaining = project.opportunities_remaining_billable_hours;
        const budgeted = project.opportunities_budgeted_hours;
        const percentageRemaining = budgeted > 0 ? (remaining / budgeted) * 100 : 0;
        
        let barColor = 'bg-green-500';
        if (percentageRemaining < 25) barColor = 'bg-red-500';
        else if (percentageRemaining < 50) barColor = 'bg-yellow-500';

        return (
            <div className="w-full">
                <div className="flex justify-between mb-1">
                    <span className="text-xs font-medium text-slate-600">{percentageRemaining.toFixed(0)}% Remaining</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                    <div 
                        className={`${barColor} h-2 rounded-full`} 
                        style={{ width: `${Math.min(percentageRemaining, 100)}%` }}
                    ></div>
                </div>
            </div>
        );
    };

    return (
        <div className="overflow-x-auto max-h-72">
            <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-600 uppercase bg-slate-50 sticky top-0">
                    <tr>
                        <th className="px-4 py-2">Opp Name</th>
                        <th className="px-4 py-2">Owner</th>
                        <th className="px-4 py-2">Due Date</th>
                        <th className="px-4 py-2 text-center">Budgeted</th>
                        <th className="px-4 py-2 text-center">Billable</th>
                        <th className="px-4 py-2 text-center">Remaining</th>
                        <th className="px-4 py-2 text-center">Non-Billable</th>
                        <th className="px-4 py-2 min-w-[120px]">% Hours Remaining</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                    {projects.map(proj => (
                        <tr key={proj.opportunities_id} className="hover:bg-slate-50">
                            <td className="px-4 py-2 font-medium text-slate-800" title={proj.opportunities_name}>{proj.opportunities_name}</td>
                            <td className="px-4 py-2 text-xs text-slate-500 truncate" title={proj.opportunities_project_owner_email}>{proj.opportunities_project_owner_email}</td>
                            <td className="px-4 py-2 whitespace-nowrap">{formatDate(proj.opportunities_rl_open_project_new_end_date)}</td>
                            <td className="px-4 py-2 text-center font-semibold">{proj.opportunities_budgeted_hours}</td>
                            <td className="px-4 py-2 text-center">{proj.opportunities_billable_hours}</td>
                            <td className="px-4 py-2 text-center font-bold text-indigo-700">{proj.opportunities_remaining_billable_hours}</td>
                            <td className="px-4 py-2 text-center text-red-600">{proj.opportunities_non_billable_hours}</td>
                            <td className="px-4 py-2">{renderProgressBar(proj)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const HistoricalOpportunitiesList: React.FC<{ opportunities: Opportunity[] }> = ({ opportunities }) => {
    const sortedOpps = useMemo(() => {
        // Sort by close date, descending
        return [...opportunities].sort((a, b) => 
            new Date(b.opportunities_close_date).getTime() - new Date(a.opportunities_close_date).getTime()
        );
    }, [opportunities]);

    if (opportunities.length === 0) {
        return <p className="text-slate-500 text-sm">No historical opportunities found.</p>;
    }

    return (
        <div className="overflow-auto max-h-72">
            <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-600 uppercase bg-slate-50 sticky top-0">
                    <tr>
                        <th className="px-4 py-2">Opp Name</th>
                        <th className="px-4 py-2">Owner</th>
                        <th className="px-4 py-2">Stage</th>
                        <th className="px-4 py-2 text-right">Amount</th>
                        <th className="px-4 py-2 text-right">Incr. Bookings</th>
                        <th className="px-4 py-2 text-center">Services Attached</th>
                        <th className="px-4 py-2">Type</th>
                        <th className="px-4 py-2">Close Date</th>
                        <th className="px-4 py-2">Connectors</th>
                        <th className="px-4 py-2">Sizes</th>
                        <th className="px-4 py-2">Destinations</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                    {sortedOpps.map(opp => (
                        <tr key={opp.opportunities_id} className="hover:bg-slate-50">
                            <td className="px-4 py-2 font-medium text-slate-800" title={opp.opportunities_name}>{opp.opportunities_name}</td>
                            <td className="px-4 py-2">{opp.opportunities_owner_name}</td>
                            <td className="px-4 py-2"><Tag status={opp.opportunities_stage_name} /></td>
                            <td className="px-4 py-2 text-right font-semibold">{formatCurrency(opp.opportunities_amount)}</td>
                            <td className="px-4 py-2 text-right">{formatCurrency(opp.opportunities_incremental_bookings)}</td>
                            <td className="px-4 py-2 text-center"><Tag status={opp.opportunities_has_services_flag} /></td>
                            <td className="px-4 py-2">{opp.opportunities_type}</td>
                            <td className="px-4 py-2 whitespace-nowrap">{formatDate(opp.opportunities_close_date)}</td>
                            <td className="px-4 py-2 truncate max-w-[150px]" title={opp.opportunities_connectors}>{opp.opportunities_connectors}</td>
                            <td className="px-4 py-2 truncate max-w-[50px]" title={opp.opportunities_connector_tshirt_size_list}>{opp.opportunities_connector_tshirt_size_list}</td>
                            <td className="px-4 py-2 truncate max-w-[100px]" title={opp.opportunities_destinations}>{opp.opportunities_destinations}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};


const OpportunityDetail: React.FC<OpportunityDetailProps> = ({ opportunity, details, historicalOpportunities, onBack, onSave }) => {
  return (
    <div className="animate-fade-in">
      <button onClick={onBack} className="mb-6 flex items-center space-x-2 text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition">
        {ICONS.arrowLeft}
        <span>Back to Opportunities</span>
      </button>

      <header className="mb-8 p-4 bg-white rounded-lg shadow-md">
        <p className="text-sm text-indigo-600 font-semibold">{opportunity.accounts_salesforce_account_name} / {opportunity.accounts_region_name}</p>
        <h2 className="text-3xl font-bold text-slate-800 mt-1">{opportunity.opportunities_name}</h2>
        <div className="mt-2 text-sm text-slate-500 flex items-center space-x-4">
            <span><strong>Opp Owner:</strong> {opportunity.opportunities_owner_name}</span>
            <span><strong>Amount:</strong> <span className="font-bold text-green-700">{formatCurrency(opportunity.opportunities_amount)}</span></span>
        </div>
      </header>

      <div className="space-y-6">
        {/* Row 1: Full-width Usage History */}
        <Card title="Account Usage History (Last 3 Months)" icon={ICONS.table}>
            <UsageHistoryTable usage={details.usageHistory} />
        </Card>

        {/* Row 2: Two-column section for Support & Historical Opps */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
                <Card title="Account Support Summary" icon={ICONS.ticket}>
                    <SupportTickets tickets={details.supportTickets} />
                </Card>
            </div>
            
            <Card title="Historical Opportunities" icon={ICONS.history}>
                <HistoricalOpportunitiesList opportunities={historicalOpportunities} />
            </Card>
        </div>

        {/* Row 3: Full-width Past Projects */}
        <Card title="Past Services Projects" icon={ICONS.briefcase}>
            <ProjectHistoryList projects={details.projectHistory} />
        </Card>
      </div>
      
      <div className="mt-8">
        <DispositionForm onSave={onSave} initialDisposition={opportunity.disposition} />
      </div>

    </div>
  );
};

export default OpportunityDetail;