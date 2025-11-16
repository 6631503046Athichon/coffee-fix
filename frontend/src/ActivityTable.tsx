import { useState } from 'react';
import DatePicker from './components/common/DatePicker';

interface Activity {
  id: string;
  plot: string;
  date: string;
  type: string;
  product: string;
  quantity: string;
  notes: string;
}

export default function ActivityTable({ activities, onUpdate, onDelete }: { 
  activities: Activity[], 
  onUpdate: (id: string, updatedActivity: Activity) => void,
  onDelete: (id: string) => void 
}) {
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const handleEdit = (activity: Activity) => {
    setEditingActivity({ ...activity });
    setShowEditModal(true);
  };

  const handleSave = () => {
    if (editingActivity) {
      onUpdate(editingActivity.id, editingActivity);
      setShowEditModal(false);
      setEditingActivity(null);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('คุณต้องการลบข้อมูลนี้ใช่หรือไม่?')) {
      onDelete(id);
    }
  };

  return (
    <>
      <table>
        <thead>
          <tr>
            <th>PLOT</th>
            <th>DATE</th>
            <th>TYPE</th>
            <th>PRODUCT/METHOD</th>
            <th>QUANTITY</th>
            <th>NOTES</th>
            <th>ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          {activities.map((activity) => (
            <tr key={activity.id}>
              <td>{activity.plot}</td>
              <td>{activity.date}</td>
              <td><span className="badge">{activity.type}</span></td>
              <td>{activity.product}</td>
              <td>{activity.quantity}</td>
              <td>{activity.notes}</td>
              <td>
                <button onClick={() => handleEdit(activity)} className="btn-edit">แก้ไข</button>
                <button onClick={() => handleDelete(activity.id)} className="btn-delete">ลบ</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showEditModal && editingActivity && (
        <div className="modal">
          <div className="modal-content">
            <h2>แก้ไขข้อมูล</h2>
            <label>
              Plot:
              <input value={editingActivity.plot} onChange={(e) => setEditingActivity({...editingActivity, plot: e.target.value})} />
            </label>
            <label>
              <DatePicker
                value={editingActivity.date}
                onChange={(date) => setEditingActivity({...editingActivity, date})}
                label="Date"
              />
            </label>
            <label>
              Type:
              <input value={editingActivity.type} onChange={(e) => setEditingActivity({...editingActivity, type: e.target.value})} />
            </label>
            <label>
              Product/Method:
              <input value={editingActivity.product} onChange={(e) => setEditingActivity({...editingActivity, product: e.target.value})} />
            </label>
            <label>
              Quantity:
              <input value={editingActivity.quantity} onChange={(e) => setEditingActivity({...editingActivity, quantity: e.target.value})} />
            </label>
            <label>
              Notes:
              <textarea value={editingActivity.notes} onChange={(e) => setEditingActivity({...editingActivity, notes: e.target.value})} />
            </label>
            <div className="modal-actions">
              <button onClick={handleSave} className="btn-save">บันทึก</button>
              <button onClick={() => setShowEditModal(false)} className="btn-cancel">ยกเลิก</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
