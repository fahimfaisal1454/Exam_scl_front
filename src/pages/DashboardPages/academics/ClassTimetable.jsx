// src/pages/DashboardPages/academics/ClassTimetable.jsx
import { useEffect, useMemo, useState } from "react";
import AxiosInstance from "../../../components/AxiosInstance";
import { Toaster, toast } from "react-hot-toast";

const DAYS = [
  { value: "Mon", label: "Monday" },
  { value: "Tue", label: "Tuesday" },
  { value: "Wed", label: "Wednesday" },
  { value: "Thu", label: "Thursday" },
  { value: "Fri", label: "Friday" },
  { value: "Sat", label: "Saturday" },
  { value: "Sun", label: "Sunday" },
];

const emptyForm = {
  class_id: "",
  section_id: "",
  subject_id: "",
  teacher_id: "",
  day: "",
  period_id: "",
  period_label: "",
  start_time: "",
  end_time: "",
  classroom_id: "",
};

export default function ClassTimetable() {
  // lookups
  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [rooms, setRooms] = useState([]);

  // data
  const [rows, setRows] = useState([]);

  // ui
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  // filters
  const [filters, setFilters] = useState({ class_id: "", section_id: "", teacher_id: "", day: "" });

  // --- helpers ---
  const tryGet = async (endpoints) => {
    for (const url of endpoints) {
      try {
        const res = await AxiosInstance.get(url);
        if (Array.isArray(res?.data)) return res.data;
      } catch (_) { /* ignore and try next */ }
    }
    return [];
  };

  const timeHHMM = (t) => (t ? String(t).slice(0, 5) : "");

  const periodById = useMemo(() => Object.fromEntries(periods.map(p => [String(p.id), p])), [periods]);

  // --- initial loads ---
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [p, r, c, s, t] = await Promise.all([
          tryGet(["periods/"]),
          tryGet(["rooms/"]),
          tryGet(["class-names/", "classes/", "class_name/"]),
          tryGet(["sections/", "section/"]),
          tryGet(["teachers/", "people/teachers/", "faculty/teachers/", "faculty/"]),
        ]);
        setPeriods(p);
        setRooms(r);
        setClasses(c);
        setSections(s);
        setTeachers(t);
      } finally {
        setLoading(false);
      }
    })();
    reloadTable();
  }, []);

  // load subjects when class changes
  useEffect(() => {
    (async () => {
      if (!form.class_id && !filters.class_id) { setSubjects([]); return; }
      const classId = form.class_id || filters.class_id;
      try {
        // Prefer subjects filtered by class; fall back to all subjects
        const res = await AxiosInstance.get(`subjects/?class_name=${classId}`);
        setSubjects(Array.isArray(res.data) ? res.data : []);
      } catch (_) {
        try {
          const res2 = await AxiosInstance.get(`assigned-subjects/?class_name=${classId}`);
          setSubjects(Array.isArray(res2.data) ? res2.data.map(x => x.subject) : []);
        } catch (__) {
          try {
            const res3 = await AxiosInstance.get("subjects/");
            setSubjects(Array.isArray(res3.data) ? res3.data : []);
          } catch (___) {
            setSubjects([]);
          }
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.class_id, filters.class_id]);

  async function reloadTable() {
    setLoading(true);
    try {
      const params = {};
      if (filters.class_id) params.class_name = filters.class_id;
      if (filters.section_id) params.section = filters.section_id;
      if (filters.teacher_id) params.teacher_id = filters.teacher_id;
      if (filters.day) params.day_of_week = filters.day;
      let res;
      try {
        res = await AxiosInstance.get("timetable/", { params });
      } catch (_) {
        res = await AxiosInstance.get("class-routines/", { params }); // fallback alias if present
      }
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load timetable");
    } finally {
      setLoading(false);
    }
  }

  // --- handlers ---
  const setField = (name, value) => setForm(f => ({ ...f, [name]: value }));

  const onSelectPeriod = (periodId) => {
    setField("period_id", periodId);
    const p = periodById[String(periodId)];
    if (p) {
      setField("period_label", p.name);
      setField("start_time", p.start_time ?? "");
      setField("end_time", p.end_time ?? "");
    }
  };

  const validate = () => {
    const req = ["class_id","section_id","subject_id","teacher_id","day","period_label","start_time","end_time"];
    for (const k of req) if (!String(form[k] ?? "").trim()) return `Missing ${k.replace("_", " ")}`;
    if (form.start_time >= form.end_time) return "Start time must be before end time";
    return null;
  };

  async function saveNew() {
    const v = validate();
    if (v) { toast.error(v); return; }
    setSaving(true);
    const payload = {
      class_name: form.class_id,
      section: form.section_id,
      subject: form.subject_id,
      teacher: form.teacher_id,
      day_of_week: form.day,
      period: form.period_label, // text label
      start_time: form.start_time,
      end_time: form.end_time,
      classroom: form.classroom_id || null,
    };
    try {
      await AxiosInstance.post("timetable/", payload);
      toast.success("Saved");
      clearForm();
      reloadTable();
    } catch (e) {
      const msg = e?.response?.data ? jsonErrors(e.response.data) : "Save failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    if (!editingId) return;
    const v = validate();
    if (v) { toast.error(v); return; }
    setSaving(true);
    const payload = {
      class_name: form.class_id,
      section: form.section_id,
      subject: form.subject_id,
      teacher: form.teacher_id,
      day_of_week: form.day,
      period: form.period_label,
      start_time: form.start_time,
      end_time: form.end_time,
      classroom: form.classroom_id || null,
    };
    try {
      await AxiosInstance.patch(`timetable/${editingId}/`, payload);
      toast.success("Updated");
      clearForm();
      reloadTable();
    } catch (e) {
      const msg = e?.response?.data ? jsonErrors(e.response.data) : "Update failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id) {
    if (!confirm("Delete this slot?")) return;
    try {
      await AxiosInstance.delete(`timetable/${id}/`);
      toast.success("Deleted");
      reloadTable();
    } catch (e) {
      const msg = e?.response?.data ? jsonErrors(e.response.data) : "Delete failed";
      toast.error(msg);
    }
  }

  function onEdit(row) {
    setEditingId(row.id);
    setForm({
      class_id: row.class_name || row.class_name_id || row.class || "",
      section_id: row.section || row.section_id || "",
      subject_id: row.subject || row.subject_id || "",
      teacher_id: row.teacher || row.teacher_id || "",
      day: row.day_of_week || row.day || "",
      period_id: "", // we only store label on entry; keep blank
      period_label: row.period || "",
      start_time: row.start_time || "",
      end_time: row.end_time || "",
      classroom_id: row.classroom || row.classroom_id || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function clearForm() {
    setEditingId(null);
    setForm(emptyForm);
    setErr("");
  }

  const filteredSubjects = useMemo(() => {
    if (!form.class_id) return subjects;
    // If subjects already filtered by API, return as-is
    // else try to filter by subject.class_name id fields if present
    return subjects.filter((s) => {
      const cid = s.class_name || s.class_name_id || s.class || s.classId;
      return !cid || String(cid) === String(form.class_id);
    });
  }, [subjects, form.class_id]);

  const classLabel = (id) => classes.find(c => String(c.id) === String(id))?.name || classes.find(c => String(c.id) === String(id))?.title || id;
  const sectionLabel = (id) => sections.find(s => String(s.id) === String(id))?.name || id;
  const subjectLabel = (id) => subjects.find(s => String(s.id) === String(id))?.name || subjects.find(s => String(s.id) === String(id))?.title || id;
  const teacherLabel = (id) => teachers.find(t => String(t.id) === String(id))?.full_name || teachers.find(t => String(t.id) === String(id))?.name || id;
  const roomLabel = (id) => rooms.find(r => String(r.id) === String(id))?.name || id;

  return (
    <div className="space-y-4">
      <Toaster position="top-right" />
      <h1 className="text-2xl font-semibold">Class Timetable</h1>

      {/* --- Add / Edit form --- */}
      <div className="bg-white border rounded p-3 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <SelectBox label="Class" value={form.class_id} onChange={(v)=>setField("class_id", v)} options={classes} getLabel={(o)=>o.name || o.title} />
          <SelectBox label="Section" value={form.section_id} onChange={(v)=>setField("section_id", v)} options={sections} getLabel={(o)=>o.name} />
          <SelectBox label="Subject" value={form.subject_id} onChange={(v)=>setField("subject_id", v)} options={filteredSubjects} getLabel={(o)=>o.name || o.title} />
          <SelectBox label="Teacher" value={form.teacher_id} onChange={(v)=>setField("teacher_id", v)} options={teachers} getLabel={(o)=>o.full_name || o.name} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          {/* Day */}
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Day</label>
            <select value={form.day} onChange={e=>setField("day", e.target.value)} className="select select-bordered">
              <option value="">Select day</option>
              {DAYS.map(d=> <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>

          {/* Period (select) */}
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Period</label>
            <select value={form.period_id} onChange={e=>onSelectPeriod(e.target.value)} className="select select-bordered">
              <option value="">Select period</option>
              {periods.sort((a,b)=> (a.order||0)-(b.order||0)).map(p=> (
                <option key={p.id} value={p.id}>{p.name} ({timeHHMM(p.start_time)}–{timeHHMM(p.end_time)})</option>
              ))}
            </select>
          </div>

          {/* Start */}
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Start time</label>
            <input type="time" className="input input-bordered" value={timeHHMM(form.start_time)} onChange={e=>setField("start_time", e.target.value+":00")} />
          </div>

          {/* End */}
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">End time</label>
            <input type="time" className="input input-bordered" value={timeHHMM(form.end_time)} onChange={e=>setField("end_time", e.target.value+":00")} />
          </div>

          {/* Room */}
          <SelectBox label="Classroom (optional)" value={form.classroom_id} onChange={(v)=>setField("classroom_id", v)} options={rooms} getLabel={(o)=>o.name} />
        </div>

        {err && <div className="alert alert-error text-sm">{err}</div>}

        <div className="flex gap-2">
          {!editingId ? (
            <button className="btn btn-success" onClick={saveNew} disabled={saving}>Add Row</button>
          ) : (
            <>
              <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>Update</button>
              <button className="btn" onClick={clearForm} type="button">Cancel</button>
            </>
          )}
        </div>
      </div>

      {/* --- Filters --- */}
      <div className="bg-white border rounded p-3">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <SelectBox label="Filter: Class" value={filters.class_id} onChange={(v)=>setFilters(f=>({...f, class_id:v}))} options={classes} getLabel={(o)=>o.name || o.title} />
          <SelectBox label="Filter: Section" value={filters.section_id} onChange={(v)=>setFilters(f=>({...f, section_id:v}))} options={sections} getLabel={(o)=>o.name} />
          <SelectBox label="Filter: Teacher" value={filters.teacher_id} onChange={(v)=>setFilters(f=>({...f, teacher_id:v}))} options={teachers} getLabel={(o)=>o.full_name || o.name} />
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Filter: Day</label>
            <select value={filters.day} onChange={e=>setFilters(f=>({...f, day:e.target.value}))} className="select select-bordered">
              <option value="">All days</option>
              {DAYS.map(d=> <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          <div className="flex items-end"><button className="btn" onClick={reloadTable}>Apply</button></div>
        </div>
      </div>

      {/* --- Table --- */}
      <div className="bg-white border rounded overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Day</th>
              <th>Period</th>
              <th>Time</th>
              <th>Class / Section</th>
              <th>Subject</th>
              <th>Teacher</th>
              <th>Room</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8}>No rows</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.day_of_week_display || r.day_of_week || r.day}</td>
                  <td>{r.period}</td>
                  <td>{timeHHMM(r.start_time)}–{timeHHMM(r.end_time)}</td>
                  <td>{r.class_name_label || classLabel(r.class_name)}{" "}{r.section_label || sectionLabel(r.section)}</td>
                  <td>{r.subject_label || subjectLabel(r.subject)}</td>
                  <td>{r.teacher_label || teacherLabel(r.teacher)}</td>
                  <td>{r.classroom_label || roomLabel(r.classroom) || r.room || "—"}</td>
                  <td className="text-right">
                    <button className="btn btn-xs mr-2" onClick={()=>onEdit(r)}>Edit</button>
                    <button className="btn btn-xs btn-error" onClick={()=>onDelete(r.id)}>Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SelectBox({ label, value, onChange, options, getLabel }) {
  return (
    <div className="flex flex-col">
      {label && <label className="text-xs text-gray-600">{label}</label>}
      <select className="select select-bordered" value={value || ""} onChange={(e)=>onChange(e.target.value)}>
        <option value="">Select…</option>
        {(options||[]).map((o) => (
          <option key={o.id} value={o.id}>{getLabel ? getLabel(o) : (o.name || o.title || o.label || o.id)}</option>
        ))}
      </select>
    </div>
  );
}

function jsonErrors(payload) {
  try {
    if (typeof payload === "string") return payload;
    if (Array.isArray(payload)) return payload.join("; ");
    return Object.entries(payload).map(([k,v]) => `${k}: ${Array.isArray(v)?v.join(', '):v}`).join(" | ");
  } catch {
    return "Validation error";
  }
}
