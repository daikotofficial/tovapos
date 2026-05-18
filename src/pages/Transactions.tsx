import React, { useState } from 'react'
import { useStore } from '@/store/useStore'
import { Search, Eye, Download } from 'lucide-react'

const Transactions: React.FC = () => {
  const { sales } = useStore()
  const [searchDate, setSearchDate] = useState('')
  const [selectedSale, setSelectedSale] = useState<string | null>(null)

  const filteredSales = searchDate
    ? sales.filter((s) => s.timestamp.startsWith(searchDate))
    : sales

  const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0)
  const totalTransactions = sales.length

  const getSaleDetails = (saleId: string) => {
    return sales.find((s) => s.id === saleId)
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
          <p className="text-blue-600 text-sm font-semibold">Total Revenue</p>
          <p className="text-3xl font-bold text-blue-900 mt-2">
            ${totalRevenue.toFixed(2)}
          </p>
        </div>
        <div className="bg-green-50 rounded-lg p-6 border border-green-200">
          <p className="text-green-600 text-sm font-semibold">Total Transactions</p>
          <p className="text-3xl font-bold text-green-900 mt-2">{totalTransactions}</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-6 border border-purple-200">
          <p className="text-purple-600 text-sm font-semibold">Average Sale</p>
          <p className="text-3xl font-bold text-purple-900 mt-2">
            ${totalTransactions > 0 ? (totalRevenue / totalTransactions).toFixed(2) : '0.00'}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center space-x-4 mb-6">
          <Search size={20} className="text-gray-400" />
          <input
            type="date"
            value={searchDate}
            onChange={(e) => setSearchDate(e.target.value)}
            placeholder="Filter by date"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {searchDate && (
            <button
              onClick={() => setSearchDate('')}
              className="px-4 py-2 text-sm bg-gray-200 hover:bg-gray-300 rounded-lg"
            >
              Clear
            </button>
          )}
        </div>

        {filteredSales.length === 0 ? (
          <p className="text-center text-gray-500 py-8">No transactions found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                    Receipt #
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                    Date/Time
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                    Staff
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                    Items
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                    Total
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                    Method
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.map((sale) => (
                  <tr key={sale.id} className="border-b hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-mono font-semibold text-gray-800">
                      {sale.id.substring(0, 8).toUpperCase()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(sale.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{sale.staffId}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{sale.items.length}</td>
                    <td className="px-6 py-4 text-sm font-bold text-indigo-600">
                      ${sale.total.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-xs font-medium capitalize">
                        {sale.paymentMethod === 'mobile' ? 'Mobile Money' : sale.paymentMethod}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <button
                        onClick={() =>
                          setSelectedSale(selectedSale === sale.id ? null : sale.id)
                        }
                        className="inline-flex items-center space-x-1 px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedSale && getSaleDetails(selectedSale) && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">
            Receipt #{selectedSale.substring(0, 8).toUpperCase()} Details
          </h3>
          {getSaleDetails(selectedSale)?.items.map((item, idx) => (
            <div key={idx} className="flex justify-between py-2 border-b">
              <span className="text-gray-700">
                {item.product.name} x {item.quantity}
              </span>
              <span className="font-semibold text-gray-800">
                ${(item.product.price * item.quantity).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Transactions
