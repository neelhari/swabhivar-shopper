import React, { useState, useEffect } from 'react';
import { Search, PackageSearch, Trash2, Eye } from 'lucide-react';
import { toast } from 'react-toastify';
import { VendorDetailsModal } from '../../components/admin/VendorDetailsModal';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000/api";

export function AdminVendorProductsPage() {
  const [products, setProducts] = useState([]);
  const [vendorsMap, setVendorsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchVendors = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BACKEND_URL}/admin/vendors`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const map = {};
        (data.vendors || []).forEach(v => { map[v.id] = v; });
        setVendorsMap(map);
      }
    } catch {}
  };

  const fetchProducts = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BACKEND_URL}/admin/vendor-products`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setProducts(data.products || []);
      }
    } catch (error) {
      toast.error('Failed to load vendor products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchVendors();
  }, []);

  const handleOpenVendor = (product) => {
    const fullVendor = vendorsMap[product.vendor_id] || {};
    setSelectedVendor({
      id: product.vendor_id,
      name: fullVendor.name || '',
      store_name: product.store_name || fullVendor.store_name || '',
      email: product.vendor_email || fullVendor.email || '',
      phone: fullVendor.phone || ''
    });
    setModalOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this vendor product? This cannot be undone.')) return;
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BACKEND_URL}/admin/products/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success(`Product deleted successfully!`);
        fetchProducts();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Delete failed');
      }
    } catch (error) {
      toast.error('Failed to delete product');
    }
  };

  const filteredProducts = products.filter(p => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (p.name && String(p.name).toLowerCase().includes(term)) ||
      (p.store_name && String(p.store_name).toLowerCase().includes(term)) ||
      (p.category && String(p.category).toLowerCase().includes(term))
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Vendor Products</h1>
        <p className="text-gray-500 mt-1">Oversee and moderate all products listed by vendors.</p>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by product name or store..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#012980]"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 font-semibold text-sm text-gray-900">Product</th>
                <th className="px-6 py-4 font-semibold text-sm text-gray-900">Vendor Store</th>
                <th className="px-6 py-4 font-semibold text-sm text-gray-900">Base Price</th>
                <th className="px-6 py-4 font-semibold text-sm text-gray-900">Stock</th>
                <th className="px-6 py-4 font-semibold text-sm text-gray-900 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-gray-500">Loading products...</td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-gray-500">
                    <PackageSearch className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    No vendor products found.
                  </td>
                </tr>
              ) : (
                                filteredProducts.map(product => {
                  let parsedSizes = [];
                  try {
                    if (typeof product.sizes === 'string') {
                      parsedSizes = JSON.parse(product.sizes);
                    } else if (Array.isArray(product.sizes)) {
                      parsedSizes = product.sizes;
                    }
                  } catch (e) {}
  
                  let price = product.price || 0;
                  let stock = product.stock || 0;
  
                  if (parsedSizes && parsedSizes.length > 0) {
                    if (parsedSizes[0].sizes && Array.isArray(parsedSizes[0].sizes) && parsedSizes[0].sizes.length > 0) {
                      price = parsedSizes[0].sizes[0].price;
                      stock = parsedSizes.reduce((acc, color) => acc + (color.sizes?.reduce((sum, s) => sum + (Number(s.stock)||0), 0)||0), 0);
                    } else if (parsedSizes[0].price !== undefined) {
                      price = parsedSizes[0].price;
                      stock = parsedSizes.reduce((acc, s) => acc + (Number(s.stock)||0), 0);
                    }
                  }
  
                  return (
                    <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <img src={product.image_url || '/placeholder.png'} alt={product.name} className="w-10 h-10 rounded-lg object-cover bg-gray-100" />
                          <div>
                            <div className="font-medium text-gray-900">{product.name}</div>
                            <div className="text-xs text-gray-500">{product.category}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{product.store_name}</div>
                        <div className="text-xs text-gray-500 mb-1.5">{product.vendor_email}</div>
                        <button
                          onClick={() => handleOpenVendor(product)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5 text-gray-500" />
                          View Vendor Details
                        </button>
                      </td>
                      <td className="px-6 py-4 text-gray-900">
                        ₹{price.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-gray-900">
                        {stock} units
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleDelete(product.id)}
                          className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors"
                          title="Delete Product"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <VendorDetailsModal
        isOpen={modalOpen}
        vendor={selectedVendor}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
