"use client";

import { Search, Smile } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const EMOJI_CATEGORIES = [
	{
		title: "Home & Living",
		emojis: [
			{ char: "🏠", keywords: "home house living building" },
			{ char: "🏡", keywords: "home house garden" },
			{ char: "🛋️", keywords: "sofa couch furniture" },
			{ char: "🛏️", keywords: "bed furniture sleep" },
			{ char: "🪑", keywords: "chair furniture seat" },
			{ char: "🖼️", keywords: "picture frame art decor" },
			{ char: "🪴", keywords: "plant pot garden decor" },
			{ char: "🧹", keywords: "broom clean sweep" },
			{ char: "🛠️", keywords: "tools fix repair" },
		],
	},
	{
		title: "Food & Drinks",
		emojis: [
			{ char: "🍔", keywords: "burger food fastfood" },
			{ char: "🍕", keywords: "pizza food italian" },
			{ char: "🍜", keywords: "noodles ramen food asian" },
			{ char: "🥗", keywords: "salad healthy food veg" },
			{ char: "🍣", keywords: "sushi food japanese" },
			{ char: "🥪", keywords: "sandwich food lunch" },
			{ char: "🥐", keywords: "croissant food bakery" },
			{ char: "🍽️", keywords: "plate fork knife food dinner" },
			{ char: "☕", keywords: "coffee drink cafe tea" },
			{ char: "🍩", keywords: "donut sweet dessert" },
			{ char: "🍦", keywords: "icecream sweet dessert" },
			{ char: "🥤", keywords: "soda drink" },
			{ char: "🧃", keywords: "juice drink" },
			{ char: "🍷", keywords: "wine drink alcohol" },
			{ char: "🍺", keywords: "beer drink alcohol" },
			{ char: "🍻", keywords: "beers drinks alcohol cheers" },
		],
	},
	{
		title: "Transport & Travel",
		emojis: [
			{ char: "🚗", keywords: "car transport travel" },
			{ char: "🚌", keywords: "bus transport travel" },
			{ char: "🚆", keywords: "train transport travel" },
			{ char: "🚕", keywords: "taxi transport travel" },
			{ char: "🚙", keywords: "suv car transport" },
			{ char: "🛵", keywords: "scooter transport bike" },
			{ char: "🚲", keywords: "bicycle transport bike" },
			{ char: "🛴", keywords: "scooter transport" },
			{ char: "⛽", keywords: "fuel gas petrol station" },
			{ char: "✈️", keywords: "plane transport travel flight" },
			{ char: "🛫", keywords: "takeoff flight travel" },
			{ char: "🛬", keywords: "landing flight travel" },
			{ char: "🚐", keywords: "van transport travel" },
			{ char: "🚚", keywords: "truck transport delivery" },
			{ char: "🚢", keywords: "ship boat transport travel" },
			{ char: "🏨", keywords: "hotel travel stay" },
			{ char: "🧳", keywords: "luggage travel suitcase" },
			{ char: "🗺️", keywords: "map travel direction" },
		],
	},
	{
		title: "Utilities & Bills",
		emojis: [
			{ char: "💡", keywords: "light bulb electricity utility" },
			{ char: "🔌", keywords: "plug electricity utility" },
			{ char: "💧", keywords: "water drop utility" },
			{ char: "🔥", keywords: "fire gas heat utility" },
			{ char: "📡", keywords: "satellite antenna internet" },
			{ char: "📶", keywords: "signal mobile network" },
			{ char: "🧯", keywords: "fire extinguisher safety" },
			{ char: "🗑️", keywords: "trash bin waste" },
			{ char: "📬", keywords: "mail post box" },
		],
	},
	{
		title: "Shopping & Retail",
		emojis: [
			{ char: "🛍️", keywords: "shopping bags retail purchase" },
			{ char: "🛒", keywords: "cart shopping grocery" },
			{ char: "📦", keywords: "box package delivery" },
			{ char: "👕", keywords: "shirt clothing apparel" },
			{ char: "👟", keywords: "shoes clothing apparel" },
			{ char: "👜", keywords: "handbag clothing accessory" },
			{ char: "💄", keywords: "lipstick makeup beauty" },
			{ char: "🧴", keywords: "lotion beauty skincare" },
		],
	},
	{
		title: "Entertainment & Subscriptions",
		emojis: [
			{ char: "🎬", keywords: "movie cinema film" },
			{ char: "🎮", keywords: "game console play" },
			{ char: "🎵", keywords: "music note song" },
			{ char: "🎤", keywords: "microphone sing music" },
			{ char: "🎭", keywords: "theater drama arts" },
			{ char: "🎟️", keywords: "ticket event movie" },
			{ char: "📺", keywords: "tv television screen" },
			{ char: "🎨", keywords: "art paint color" },
			{ char: "🎯", keywords: "target goal game" },
			{ char: "🎲", keywords: "dice game play" },
			{ char: "🎸", keywords: "guitar music instrument" },
			{ char: "📸", keywords: "camera photo picture" },
			{ char: "🕶️", keywords: "sunglasses fashion" },
		],
	},
	{
		title: "Education & Learning",
		emojis: [
			{ char: "🎓", keywords: "graduation education school" },
			{ char: "📚", keywords: "books education study" },
			{ char: "✏️", keywords: "pencil write study" },
			{ char: "🧠", keywords: "brain think learning" },
			{ char: "🧪", keywords: "science experiment chemistry" },
			{ char: "🧮", keywords: "abacus math calculation" },
			{ char: "🏫", keywords: "school education building" },
		],
	},
	{
		title: "Health & Fitness",
		emojis: [
			{ char: "💊", keywords: "pill medicine health" },
			{ char: "🏥", keywords: "hospital health medical" },
			{ char: "🩺", keywords: "stethoscope health medical" },
			{ char: "🦷", keywords: "tooth health dentist" },
			{ char: "💉", keywords: "syringe health medical" },
			{ char: "🩹", keywords: "bandage health medical" },
			{ char: "😷", keywords: "mask health safety" },
			{ char: "🏋️", keywords: "weight gym fitness workout" },
			{ char: "🧘", keywords: "yoga meditation fitness" },
			{ char: "🤸", keywords: "gymnastics fitness sport" },
			{ char: "🛀", keywords: "bath clean health" },
			{ char: "🪥", keywords: "toothbrush clean dental" },
			{ char: "🧼", keywords: "soap clean hygiene" },
		],
	},
	{
		title: "Finance",
		emojis: [
			{ char: "💸", keywords: "money spend finance" },
			{ char: "💳", keywords: "card credit finance" },
			{ char: "🏦", keywords: "bank finance building" },
			{ char: "🏧", keywords: "atm cash finance" },
			{ char: "📈", keywords: "chart growth finance" },
			{ char: "📉", keywords: "chart loss finance" },
			{ char: "🧾", keywords: "receipt finance bill" },
		],
	},
	{
		title: "Work & Tech",
		emojis: [
			{ char: "👔", keywords: "tie work office apparel" },
			{ char: "💻", keywords: "laptop computer tech work" },
			{ char: "📱", keywords: "phone mobile tech" },
			{ char: "🖥️", keywords: "monitor computer tech" },
			{ char: "🖨️", keywords: "printer office tech" },
			{ char: "📎", keywords: "paperclip office supply" },
			{ char: "🔧", keywords: "wrench tool fix repair" },
			{ char: "⚙️", keywords: "gear machine process" },
			{ char: "🧰", keywords: "toolbox tools repair" },
		],
	},
	{
		title: "Family, Kids & Pets",
		emojis: [
			{ char: "👶", keywords: "baby family child" },
			{ char: "🍼", keywords: "bottle baby family" },
			{ char: "🎒", keywords: "backpack school child" },
			{ char: "🎂", keywords: "cake birthday family celebration" },
			{ char: "🐾", keywords: "paws pet animal" },
			{ char: "🐶", keywords: "dog pet animal" },
			{ char: "🐕", keywords: "dog pet animal" },
			{ char: "🐈", keywords: "cat pet animal" },
			{ char: "🦴", keywords: "bone pet dog" },
			{ char: "🧸", keywords: "teddy bear toy child" },
		],
	},
	{
		title: "Gifts & Misc",
		emojis: [
			{ char: "🎁", keywords: "gift present surprise" },
			{ char: "🔑", keywords: "key unlock access" },
			{ char: "📌", keywords: "pin mark note" },
			{ char: "🧿", keywords: "eye protection misc" },
		],
	},
];

interface EmojiPickerProps {
	ariaLabel?: string;
	className?: string;
	id?: string;
	onChange: (emoji: string) => void;
	value?: string;
}

export function EmojiPicker({
	ariaLabel = "Choose an icon",
	className,
	id,
	onChange,
	value,
}: EmojiPickerProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const containerReference = useRef<HTMLDivElement>(null);

	const filteredCategories = useMemo(() => {
		const query = search.toLowerCase().trim();
		if (!query) {
			return EMOJI_CATEGORIES;
		}

		return EMOJI_CATEGORIES.map((category) => ({
			...category,
			emojis: category.emojis.filter(
				(emoji) =>
					category.title.toLowerCase().includes(query) ||
					emoji.keywords.toLowerCase().includes(query)
			),
		})).filter((category) => category.emojis.length > 0);
	}, [search]);

	return (
		<div ref={containerReference}>
			<Popover onOpenChange={setOpen} open={open}>
				<PopoverTrigger asChild>
					<Button
						aria-expanded={open}
						aria-label={ariaLabel}
						className={cn(
							"flex h-10 w-[3rem] items-center justify-center p-0 text-xl",
							!value && "text-muted-foreground opacity-50",
							className
						)}
						id={id}
						role="combobox"
						variant="outline"
					>
						{value || <Smile className="h-5 w-5" />}
					</Button>
				</PopoverTrigger>
				<PopoverContent
					align="start"
					className="w-[300px] overflow-hidden rounded-2xl border-none p-0 shadow-xl"
					container={containerReference.current}
				>
					<div className="flex h-[350px] flex-col bg-card">
						<div className="border-b bg-muted/20 p-3">
							<div className="relative">
								<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									autoFocus
									className="h-10 rounded-xl border-none bg-background pl-9 ring-1 ring-border/50 focus-visible:ring-primary/50"
									onChange={(e) => setSearch(e.target.value)}
									placeholder="Search emojis..."
									value={search}
								/>
							</div>
						</div>
						<div className="custom-scrollbar flex-1 overflow-y-auto p-3">
							{filteredCategories.length > 0 ? (
								<div className="space-y-4">
									{filteredCategories.map((category) => (
										<div className="space-y-2" key={category.title}>
											<h4 className="px-1 font-bold text-[10px] text-muted-foreground/70 uppercase tracking-widest">
												{category.title}
											</h4>
											<div className="grid grid-cols-6 gap-1">
												{category.emojis.map((emoji) => (
													<button
														className={cn(
															"flex h-10 w-10 items-center justify-center rounded-xl text-xl transition-all hover:scale-110 hover:bg-accent active:scale-95",
															value === emoji.char &&
																"bg-primary/10 ring-1 ring-primary/50"
														)}
														key={emoji.char}
														onClick={() => {
															onChange(emoji.char);
															setOpen(false);
															setSearch("");
														}}
														title={emoji.keywords}
														type="button"
													>
														{emoji.char}
													</button>
												))}
											</div>
										</div>
									))}
								</div>
							) : (
								<div className="flex h-full flex-col items-center justify-center p-4 text-center">
									<Smile className="mb-2 h-10 w-10 text-muted-foreground/20" />
									<p className="text-muted-foreground text-sm">
										No emojis found for "{search}"
									</p>
								</div>
							)}
						</div>
					</div>
				</PopoverContent>
			</Popover>
		</div>
	);
}
