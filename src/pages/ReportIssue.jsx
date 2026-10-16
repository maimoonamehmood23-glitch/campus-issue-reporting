import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { CATEGORIES } from '../utils/constants';
import { analyzeComplaint } from '../lib/api';

const ReportIssue = () => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    location_id: '',
    manual_location: '', // Added for manual input
    category: 'Other',
    reporter_name: '',
    reporter_contact: '',
  });
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [complaintCode, setComplaintCode] = useState(null);

  useEffect(() => {
    async function fetchLocations() {
      try {
        const { data, error } = await supabase
          .from('locations')
          .select('id, building, floor, room')
          .order('building');

        if (error) throw error;
        setLocations(data || []);
      } catch (err) {
        console.error('Error fetching locations:', err);
        // We don't set a global error message here to avoid annoying users
        // if they can still use manual input.
      }
    }
    fetchLocations();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const updated = { ...prev, [name]: value };
      // Reset conflicting location field
      if (name === 'location_id') updated.manual_location = '';
      if (name === 'manual_location') updated.location_id = '';
      return updated;
    });
  };

  const handleAnalyze = async () => {
    if (formData.description.length < 10) {
      setMessage({ type: 'error', text: 'Please provide a longer description for AI analysis.' });
      return;
    }

    setAnalyzing(true);
    setMessage({ type: 'info', text: 'Analyzing complaint with AI...' });
    try {
      const result = await analyzeComplaint(formData.description);
      setFormData(prev => ({
        ...prev,
        category: result.category,
      }));
      setMessage({ type: 'success', text: `AI suggested category: ${result.category}` });
    } catch (err) {
      console.error('AI Analysis Error:', err);
      setMessage({ type: 'error', text: 'AI analysis failed, but you can still submit manually.' });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    // Basic Validation
    if (!formData.description || formData.description.length < 10) {
      setMessage({ type: 'error', text: 'Description must be at least 10 characters.' });
      setLoading(false);
      return;
    }
    if (!formData.location_id && !formData.manual_location) {
      setMessage({ type: 'error', text: 'Please select or enter a campus location.' });
      setLoading(false);
      return;
    }
    if (!formData.category) {
      setMessage({ type: 'error', text: 'Please select a category.' });
      setLoading(false);
      return;
    }

    try {
      // Use the RPC function submit_complaint defined in schema.sql
      // NOTE: The current RPC requires a UUID for location_id.
      // If the user provided a manual location, we will need to handle this.
      // For now, we use a dummy UUID or handle the error gracefully.
      const { data, error } = await supabase.rpc('submit_complaint', {
        p_category: formData.category,
        p_description: formData.manual_location
          ? `${formData.manual_location}: ${formData.description}`
          : formData.description,
        p_location_id: formData.location_id || '00000000-0000-0000-0000-000000000000', // Fallback if manual
        p_reporter_name: formData.reporter_name,
        p_reporter_contact: formData.reporter_contact,
      });

      if (error) throw error;

      setComplaintCode(data);
      setMessage({ type: 'success', text: 'Complaint submitted successfully!' });
    } catch (err) {
      console.error('Submission Error:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to submit complaint.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 py-12 px-4 flex flex-col items-center">
      <div className="max-w-2xl w-full bg-white rounded-xl shadow-lg p-8 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-slate-800">Report an Issue</h1>
          <p className="text-slate-600">Help us keep the campus running smoothly.</p>
        </div>

        {message.text && (
          <div className={`p-4 rounded-lg text-sm font-medium ${
            message.type === 'success' ? 'bg-green-100 text-green-800' :
            message.type === 'error' ? 'bg-red-100 text-red-800' :
            'bg-blue-100 text-blue-800'
          }`}>
            {message.text}
          </div>
        )}

        {complaintCode && (
          <div className="p-6 bg-blue-50 border-2 border-blue-200 rounded-xl text-center space-y-3">
            <p className="text-blue-800 font-medium">Your Complaint Ticket Number:</p>
            <p className="text-4xl font-mono font-bold text-blue-600">{complaintCode}</p>
            <p className="text-sm text-blue-600">Keep this code to track your issue status.</p>
            <button
              onClick={() => { setComplaintCode(null); setMessage({ type: '', text: '' }); }}
              className="text-sm text-blue-500 underline hover:text-blue-700"
            >
              Report another issue
            </button>
          </div>
        )}

        {!complaintCode && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700">Category</label>
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleInputChange}
                  className="w-full p-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700">Location</label>
                {locations.length > 0 ? (
                  <div className="space-y-2">
                    <select
                      name="location_id"
                      value={formData.location_id}
                      onChange={handleInputChange}
                      className="w-full p-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="">Select Location...</option>
                      {locations.map(loc => (
                        <option key={loc.id} value={loc.id}>
                          {loc.building} - {loc.floor} - {loc.room}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({...prev, location_id: '', manual_location: ''}))}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Enter location manually
                    </button>
                  </div>
                ) : (
                  <input
                    type="text"
                    name="manual_location"
                    value={formData.manual_location}
                    onChange={handleInputChange}
                    placeholder="Enter room number or area..."
                    className="w-full p-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                )}
                {locations.length > 0 && formData.manual_location && (
                  <input
                    type="text"
                    name="manual_location"
                    value={formData.manual_location}
                    onChange={handleInputChange}
                    placeholder="Enter room number or area..."
                    className="w-full p-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">Detailed Description</label>
              <div className="relative">
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="Describe the issue in detail (e.g., 'The projector in Room 201 is flickering')..."
                  className="w-full p-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none h-32"
                />
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="absolute bottom-3 right-3 text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded border border-slate-300 hover:bg-slate-200 transition-colors disabled:opacity-50"
                >
                  {analyzing ? 'Analyzing...' : '✨ Auto-categorize'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700">Your Name (Optional)</label>
                <input
                  type="text"
                  name="reporter_name"
                  value={formData.reporter_name}
                  onChange={handleInputChange}
                  className="w-full p-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="John Doe"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700">Contact Info (Optional)</label>
                <input
                  type="text"
                  name="reporter_contact"
                  value={formData.reporter_contact}
                  onChange={handleInputChange}
                  className="w-full p-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Email or Phone"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Submitting...' : 'Submit Complaint'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
};

export default ReportIssue;
