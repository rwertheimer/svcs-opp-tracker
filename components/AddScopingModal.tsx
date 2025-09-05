
import React, { useState, useEffect } from 'react';
import { ICONS } from '../constants';

interface AddScopingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: { accountName: string; contact: string; description: string; }) => void;
}

const AddScopingModal: React.FC<AddScopingModalProps> = ({ isOpen, onClose, onSave }) => {
    const [accountName, setAccountName] = useState('');
    const [contact, setContact] = useState('');
    const [description, setDescription] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen) {
            // Reset form when modal is closed
            setAccountName('');
            setContact('');
            setDescription('');
            setError('');
        }
    }, [isOpen]);

    const handleSave = () => {
        if (!accountName.trim() || !description.trim()) {
            setError('Account Name and Description are required.');
            return;
        }
        onSave({ accountName, contact, description });
    };

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40 flex justify-center items-center"
            aria-modal="true"
            role="dialog"
            onClick={onClose}
        >
            <div 
                className="bg-white rounded-lg shadow-xl w-full max-w-lg m-4 animate-fade-in-up"
                onClick={e => e.stopPropagation()} // Prevent closing when clicking inside the modal
            >
                <div className="p-4 border-b flex justify-between items-center">
                    <h2 className="text-lg font-bold text-slate-800">Add New Scoping Activity</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        {ICONS.xMark}
                    </button>
                </div>
                <div className="p-6 space-y-4">
                     {error && (
                        <div className="p-3 bg-red-100 text-red-800 border border-red-200 rounded-md text-sm">
                            {error}
                        </div>
                    )}
                    <div>
                        <label htmlFor="account-name" className="block text-sm font-medium text-slate-700 mb-1">
                            Account Name <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            id="account-name"
                            value={accountName}
                            onChange={e => setAccountName(e.target.value)}
                            className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="e.g., Acme Corporation"
                        />
                    </div>
                    <div>
                        <label htmlFor="contact" className="block text-sm font-medium text-slate-700 mb-1">
                            Primary Contact (Optional)
                        </label>
                        <input
                            type="text"
                            id="contact"
                            value={contact}
                            onChange={e => setContact(e.target.value)}
                            className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="e.g., Jane Doe (jane.doe@acme.com)"
                        />
                    </div>
                    <div>
                        <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-1">
                            Description of Work <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            id="description"
                            rows={4}
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="e.g., Initial discovery call for potential BigQuery to Snowflake migration."
                        />
                    </div>
                </div>
                <div className="p-4 bg-slate-50 border-t flex justify-end space-x-2">
                    <button onClick={onClose} className="px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-md hover:bg-slate-100 font-semibold">
                        Cancel
                    </button>
                    <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-semibold">
                        Save Activity
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AddScopingModal;
