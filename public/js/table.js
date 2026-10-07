const modal = document.getElementById('tableModal');
const modalTitle = document.getElementById('modalTitle');
const modalTableId = document.getElementById('modalTableId');
const customerInput = document.getElementById('customerCount');
const historyModal = document.getElementById('historyModal');
let currentBill = null;
let currentBillTableId = null;

// ฟังก์ชันเปิด Modal พร้อมเซ็ตค่าโต๊ะที่กด
function openTableModal(tableNumber, maxSeats) {
    const tableEl = document.getElementById(`table-${tableNumber}`);

    // ถ้าโต๊ะไม่ว่าง -> เปิดประวัติ + เช็คบิล
    if (!tableEl.classList.contains('status-available')) {
        openHistoryModal(tableNumber);
        return;
    }

    modalTitle.innerText = `เปิดรอบบุฟเฟต์: โต๊ะ ${tableNumber}`;
    modalTableId.value = tableNumber;
    customerInput.max = maxSeats;
    customerInput.value = '';
    modal.classList.add('active');
}

// ฟังก์ชันปิด Modal
function closeTableModal() {
    modal.classList.remove('active');
}

// ปิดเมื่อคลิกพื้นที่ว่างข้างนอกการ์ด
function handleBackdropClick(e) {
    if (e.target === modal) {
        closeTableModal();
    }
}

// ฟังก์ชันจัดการตอนกดยืนยันฟอร์ม
async function handleFormSubmit(e) {
    e.preventDefault();
    const formData = {
        table_id:  parseInt(modalTableId.value),
        customer_count: parseInt(customerInput.value),
        packages_id: parseInt(document.getElementById('packageSelect').value)
    };

    try {
        const response = await fetch(`/create-session`, {
            method : "POST",
            headers: {
                'Content-Type' : 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json()
        
        if (result.session_token) {

        const opt = document.getElementById('packageSelect').selectedOptions[0];
        const total = Number(opt.dataset.price) * formData.customer_count;
        const vat = Number((total * 0.07).toFixed(2));
        const timeOpts = { hour: '2-digit', minute: '2-digit' };

        document.getElementById('printTableId').innerText = formData.table_id;
        document.getElementById('printGuests').innerText = formData.customer_count;
        document.getElementById('printStartTime').innerText = new Date(result.starttime).toLocaleTimeString('th-TH', timeOpts);
        document.getElementById('printEndTime').innerText = new Date(result.endtime).toLocaleTimeString('th-TH', timeOpts);
        document.getElementById('printQty').innerText = formData.customer_count;
        document.getElementById('printPackage').innerText = opt.text;
        document.getElementById('printLineTotal').innerText = total.toFixed(2);
        document.getElementById('printVat').innerText = vat.toFixed(2);
        document.getElementById('printGrandTotal').innerText = (total + vat).toFixed(2);
        document.getElementById('printQrImage').src = result.qrcode;
        
        closeTableModal();

        window.onafterprint = () => {
        window.open(`/order/${result.session_token}`, '_blank');
        window.onafterprint = null; // เคลียร์ listener ทิ้งเพื่อไม่ให้ trigger ซ้ำ
        console.log(`${location.origin}/order/${result.session_token}`);
        };

        setTimeout(() => {
            window.print();
        }, 300);

        };
    }
    catch(err) {
        console.error("Error:", err);
    };            


    
    const currentTable = document.getElementById(`table-${formData.table_id}`);
    if (currentTable) {
        currentTable.classList.remove('status-available');
        currentTable.classList.add('status-occupied');
    }
}

async function openHistoryModal(tableNumber) {
    currentBillTableId = tableNumber;
    const res = await fetch(`/api/table-bill/${tableNumber}`);
    const data = await res.json();

    if (!res.ok) {
        alert(data.error);
        return;
    }
    currentBill = data;

    document.getElementById('historyTitle').innerText = `โต๊ะ ${tableNumber}`;
    document.getElementById('historySubtitle').innerText = `${data.package_name} • ${data.customer_count} ท่าน`;

    let html = '';
    data.items.forEach(i => {
        html += `<div style="display:flex; justify-content:space-between;">
                    <span>${i.name} × ${i.quantity}</span>
                    <span>${i.subtotal.toFixed(2)} ฿</span>
                </div>`;
    });
    document.getElementById('historyItemList').innerHTML = html || 'ยังไม่มีรายการสั่ง';

    document.getElementById('histBuffetTotal').innerText = data.buffet_total.toFixed(2) + ' ฿';
    document.getElementById('histExtraTotal').innerText = data.extra_total.toFixed(2) + ' ฿';
    document.getElementById('histTotalAmount').innerText = data.total.toFixed(2) + ' ฿';

    historyModal.classList.add('active');
}

function closeHistoryModal() {
    historyModal.classList.remove('active');
}

function handleHistoryBackdrop(e) {
    if (e.target === historyModal) closeHistoryModal();
}

const billModal = document.getElementById('billModal');

let selectedMethod = null;

function handleCheckBill() {
    document.getElementById('billTitle').innerText = `เช็คบิล: โต๊ะ ${currentBillTableId}`;
    document.getElementById('billGrandTotal').innerText = currentBill.grand_total.toFixed(2) + ' ฿';
    document.getElementById('billBuffet').innerText = currentBill.buffet_total.toFixed(2) + ' ฿';
    document.getElementById('billExtra').innerText = currentBill.extra_total.toFixed(2) + ' ฿';
    document.getElementById('billVat').innerText = currentBill.vat.toFixed(2) + ' ฿';

    // รีเซ็ตการเลือก
    selectedMethod = null;
    document.getElementById('qrBox').style.display = 'none';
    document.getElementById('cashBox').style.display = 'none';
    document.getElementById('confirmPayBtn').style.display = 'none';

    closeHistoryModal();
    billModal.classList.add('active');
}

function choosePayment(method) {
    selectedMethod = method;
    document.getElementById('qrBox').style.display = method === 'qrcode' ? 'block' : 'none';
    document.getElementById('cashBox').style.display = method === 'cash' ? 'block' : 'none';
    document.getElementById('confirmPayBtn').style.display = 'block';
}

async function confirmPay() {
    const res = await fetch('/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...currentBill, table_id: currentBillTableId, payment_method: selectedMethod })
    });
    const data = await res.json();

    if (!res.ok) {
        alert(data.error);
        return;
    }

    document.getElementById(`table-${currentBillTableId}`).className = 'table-box status-billed';
    closeBillModal();
}

function closeBillModal() {
    billModal.classList.remove('active');
}

function handleBillBackdrop(e) {
    if (e.target === billModal) closeBillModal();
}

new EventSource('/events').addEventListener('tables', (e) => {
    const data = JSON.parse(e.data);
    const box = document.getElementById(`table-${data.table_id}`);
    if (box) box.className = `table-box status-${data.status}`;
});