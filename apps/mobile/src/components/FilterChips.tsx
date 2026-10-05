import { Truck } from 'lucide-react';

interface Props {
  categories: string[];
  categoryFilter: string;
  onCategory(cat: string): void;
  addresses: string[];
  addressFilter: string;
  onAddress(addr: string): void;
  addressLabel: string;
}

export function FilterChips({ categories, categoryFilter, onCategory, addresses, addressFilter, onAddress, addressLabel }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-nowrap md:flex-wrap gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
        {['All', ...categories].map((cat) => (
          <button
            key={cat}
            onClick={() => onCategory(cat)}
            className={`shrink-0 px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all
              ${categoryFilter === cat ? 'bg-orange-500 text-white shadow-md' : 'bg-white border border-gray-200 text-gray-500 hover:border-orange-300'}`}
          >
            {cat}
          </button>
        ))}
      </div>

      {addresses.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-mono uppercase tracking-widest text-gray-400 font-bold px-1 flex items-center gap-2">
            <Truck size={10} /> {addressLabel}
          </div>
          <div className="flex flex-nowrap md:flex-wrap gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
            {['All', ...addresses].map((addr) => (
              <button
                key={addr}
                onClick={() => onAddress(addr)}
                className={`shrink-0 px-3 py-1 rounded-full text-[11px] font-bold uppercase transition-all truncate max-w-[150px]
                  ${addressFilter === addr ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
              >
                {addr === 'All' ? 'All Addresses' : addr}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
