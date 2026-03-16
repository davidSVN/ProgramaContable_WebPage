import React, { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { api } from '../../services/api';
import './PrintInvoice.css';

const PrintInvoice = ({ orderData }) => {
  const barcodeRef = useRef(null);
  const [bizInfo, setBizInfo] = useState({
    business_name: 'LAVALATU',
    business_address: 'Calle 163a #14b-25',
    business_phone: '310 669 7376',
    business_logo: null
  });

  useEffect(() => {
    api.get('/settings/business')
      .then(res => setBizInfo(res))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (orderData?.order_id && barcodeRef.current) {
      JsBarcode(barcodeRef.current, orderData.order_id, {
        format: "CODE128",
        width: 2,
        height: 40,
        displayValue: false,
        margin: 0
      });
    }
  }, [orderData]);

  if (!orderData) return null;

  const fmtCOP = (n) => '$' + (n || 0).toLocaleString('es-CO');

  return (
    <div className="print-area print-only">
      <div className="invoice-container">
        {/* Header */}
        <div className="header">
          <div className="logo-placeholder">LOGOTIPO</div>
          <div className="business-name">{bizInfo.business_name}</div>
          <div className="business-info">
            {bizInfo.business_address}<br />
            SI NO TIENES TIEMPO, LO HACEMOS POR TI
          </div>
        </div>

        {/* Domicilios */}
        <div className="domicilios-box">
          <div className="domicilios-title">DOMICILIOS</div>
          <div className="domicilios-phone">{bizInfo.business_phone}</div>
        </div>

        {/* Order Info */}
        <div className="order-title">ORDEN DE SERVICIO</div>
        <div className="order-number-box">
          {orderData.order_id}
        </div>

        {/* Barcode */}
        <div className="barcode-container">
          <svg ref={barcodeRef}></svg>
        </div>

        {/* Client Data */}
        <div className="client-section">
          <div className="info-row">
            <span className="info-label">Cliente:</span>
            <span>{orderData.client_name?.toUpperCase()}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Teléfono:</span>
            <span>{orderData.client_phone || '—'}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Email:</span>
            <span>{orderData.client_email || '—'}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Fecha:</span>
            <span>{orderData.date}</span>
          </div>
        </div>

        {/* Services Table */}
        <table className="services-table">
          <thead>
            <tr>
              <th className="col-qty">C-P</th>
              <th className="col-detail">Detalle</th>
              <th className="col-unit">Vlr.Unit</th>
              <th className="col-total">Vlr.Total</th>
            </tr>
          </thead>
          <tbody>
            {orderData.items.map((item, idx) => (
              <tr key={idx}>
                <td>{item.qty}</td>
                <td>{item.name} {item.description ? `(${item.description})` : ''}</td>
                <td>{fmtCOP(item.unit_price)}</td>
                <td>{fmtCOP(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="totals-section">
          <span className="total-pzs">Total Pzs. {orderData.items.reduce((acc, i) => acc + i.qty, 0)}</span>
          <div className="totals-row">
            <span>Subtotal:</span>
            <span>{fmtCOP(orderData.subtotal)}</span>
          </div>
          {orderData.discount > 0 && (
            <div className="totals-row">
              <span>Descuento:</span>
              <span>-{fmtCOP(orderData.discount)}</span>
            </div>
          )}
          <div className="totals-row">
            <span>Abono:</span>
            <span>{fmtCOP(orderData.abono || 0)}</span>
          </div>
          <div className="total-main">
            <div className="info-row">
              <span>PENDIENTE CANCELAR:</span>
              <span>{fmtCOP(orderData.total - (orderData.abono || 0))}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="footer-section">
          <div className="legal-notice">
            LAS ANOTACIONES MANUALES NO TENDRÁN VALIDEZ
          </div>
          <div className="metadata">
            F.Impre: {new Date().toLocaleString()}<br />
            Usr: {orderData.user_id || '—'}<br />
            {bizInfo.business_name} - Software de Gestión de Lavanderías
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintInvoice;
