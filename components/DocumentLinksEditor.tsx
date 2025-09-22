import React from 'react';
import type { Document } from '../types';
import { ICONS } from '../constants';

interface DocumentLinksEditorProps {
    documents: Document[];
    onChange: (documents: Document[]) => void;
}

const createDocument = (): Document => ({
    id:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `doc-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    text: '',
    url: '',
});

const DocumentLinksEditor: React.FC<DocumentLinksEditorProps> = ({ documents, onChange }) => {
    const handleAdd = () => {
        onChange([...documents, createDocument()]);
    };

    const handleUpdate = (index: number, updates: Partial<Document>) => {
        onChange(
            documents.map((doc, idx) =>
                idx === index
                    ? {
                          ...doc,
                          ...updates,
                      }
                    : doc
            )
        );
    };

    const handleRemove = (index: number) => {
        onChange(documents.filter((_, idx) => idx !== index));
    };

    return (
        <div className="flex h-full flex-col rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Supporting Documents</span>
                <button
                    type="button"
                    onClick={handleAdd}
                    className="flex items-center gap-1 rounded-md border border-indigo-200 px-2 py-1 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50"
                >
                    {ICONS.plusCircle}
                    <span>Add</span>
                </button>
            </div>
            {documents.length === 0 ? (
                <p className="text-sm text-slate-500">
                    Attach quick-reference links (e.g., proposals, shared docs) to keep the team aligned.
                </p>
            ) : (
                <ul className="flex-1 space-y-3 overflow-auto pr-1 text-sm">
                    {documents.map((doc, index) => (
                        <li key={doc.id ?? `${index}`} className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 space-y-2">
                                    <label className="block text-xs font-semibold text-slate-500" htmlFor={`doc-title-${doc.id || index}`}>
                                        Title
                                    </label>
                                    <input
                                        id={`doc-title-${doc.id || index}`}
                                        className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                        value={doc.text}
                                        onChange={event => handleUpdate(index, { text: event.target.value })}
                                        placeholder="Document name"
                                    />
                                    <label className="block text-xs font-semibold text-slate-500" htmlFor={`doc-url-${doc.id || index}`}>
                                        URL
                                    </label>
                                    <input
                                        id={`doc-url-${doc.id || index}`}
                                        className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                        value={doc.url}
                                        onChange={event => handleUpdate(index, { url: event.target.value })}
                                        placeholder="https://..."
                                    />
                                </div>
                                <button
                                    type="button"
                                    className="rounded-md border border-slate-200 p-1 text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                                    onClick={() => handleRemove(index)}
                                    aria-label={`Remove document ${doc.text || index + 1}`}
                                >
                                    {ICONS.trash}
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default DocumentLinksEditor;
