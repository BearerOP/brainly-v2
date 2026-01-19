import { AudioLines, Trash, File, Image, SquarePlay, FilePenLine } from "lucide-react";
import React, { useState } from "react";
import { useRecoilState, useSetRecoilState } from "recoil";
import axios from "axios";
import ContentForm from "./ContentForm";
import { allContentAtom, filteredContentAtom } from "./recoil/atoms";
import { Tags } from "../lib/contentId";
import { motion } from "framer-motion";
import { 
    Card as ShadcnCard, 
    CardContent, 
    CardFooter, 
    CardHeader, 
    CardTitle 
} from "./ui/card";

const TypeStyles: { [key: string]: JSX.Element } = {
    'image': <Image className="w-6 h-6 md:w-8 md:h-8"/>,
    'article': <File className="w-6 h-6 md:w-8 md:h-8"/>,
    'video': <SquarePlay className="w-6 h-6 md:w-8 md:h-8"/>,
    'audio': <AudioLines className="w-6 h-6 md:w-8 md:h-8"/>,
};

export interface ContentType {
    title?: string;
    type?: string;
    tags?: Tags[];
    link?: string;
    createdAt?: string;
    contentId?: string;
}

export interface CardType extends ContentType {
    sideOpen?: boolean
    variant?: boolean,
    updateModal?: boolean,
}

const Card: React.FC<CardType> = ({
    title,
    type,
    tags,
    link,
    createdAt,
    contentId = '',
    sideOpen,
    variant=false,
}) => {
    const BASE_URL = import.meta.env.VITE_BASE_URL
    const token = localStorage.getItem('token') || ''
    const [contentstore, setContentStore] = useRecoilState(allContentAtom)
    const setDisplayedContent = useSetRecoilState(filteredContentAtom)
    
    const [updateModal, setUpdateModal] = useState(false)

    const deleteContent = async(contentId: string) => {
        try {
            const filteredContent = contentstore.filter(content => content.contentId !== contentId)
            // Frontend updating quicker than BE accomodate for the lag deleting content.
            setContentStore(filteredContent)
            setDisplayedContent(filteredContent)
            await axios.delete(`
                ${BASE_URL}/content/`,{
                    data: {contentId: contentId},
                    headers: {Authorization: `Bearer ${token}`}
                } 
            );
        } catch (error) {
            console.error("Failed to delete content", error);
            alert('Error deleting the content')
            setContentStore(contentstore)
            setDisplayedContent(contentstore)
        }
    }

    // Animation variants
    const cardVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { 
            opacity: 1, 
            y: 0,
            transition: {
                duration: 0.3,
                ease: "easeOut"
            }
        },
        hover: {
            scale: 1.02,
            boxShadow: "0px 5px 15px rgba(0,0,0,0.1)",
            transition: { duration: 0.2 }
        }
    };

    const buttonVariants = {
        hover: { scale: 1.1 },
        tap: { scale: 0.95 }
    };

    return (
        <motion.div
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            whileHover="hover"
            className="h-full"
        >
            <ShadcnCard className="bg-cardColor-1 border-2 border-border h-full">
                <CardHeader className="pb-2">
                    <div className="flex justify-between">
                        <div className="flex gap-2 items-center">
                            {TypeStyles[type!]}
                            <CardTitle className="font-font1 text-[1rem] md:text[1.1rem] lg:text-[1.2rem] font-semibold tracking-normal break-words w-full line-clamp-2">
                                {title}
                            </CardTitle>
                        </div>
                        {
                            !variant && 
                            <div className="flex gap-2">
                                <motion.button 
                                    onClick={() => setUpdateModal(true)} 
                                    disabled={sideOpen}
                                    variants={buttonVariants}
                                    whileHover="hover"
                                    whileTap="tap"
                                    className="text-foreground hover:text-primary transition-colors"
                                >
                                    <FilePenLine className="w-5 h-5 md:w-6 md:h-6" />
                                </motion.button>
                                <motion.button 
                                    onClick={() => deleteContent(contentId)} 
                                    disabled={sideOpen}
                                    variants={buttonVariants}
                                    whileHover="hover"
                                    whileTap="tap"
                                    className="text-destructive hover:text-destructive/80 transition-colors"
                                >
                                    <Trash className="w-5 h-5 md:w-6 md:h-6" />
                                </motion.button>
                            </div>
                        }
                    </div>
                </CardHeader>
                <CardContent className="pb-2">
                    <div className="mb-2">
                        <ul className="flex flex-wrap gap-2">
                            {tags && tags.length > 0 && (
                                tags.map((tag) => (
                                    <motion.li
                                        key={tag.tagId}
                                        className="bg-cardColor-2 text-xs px-2 py-1 rounded"
                                        whileHover={{ scale: 1.05 }}
                                    >
                                        # {tag.title}
                                    </motion.li>
                                ))
                            )}
                        </ul>
                    </div>
                </CardContent>
                <CardFooter className="flex flex-col items-start pt-0">
                    {link && (
                        <a
                            href={sideOpen ? undefined : link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`${sideOpen ? '' : 'hover:text-primary-2 '} mb-2 inline-block font-medium font-font1 text-[0.7rem] md:text[0.75rem] lg:text-[0.85rem] tracking-normal text-cardColor-3`}
                        >
                            View Content
                        </a>
                    )}
                    
                    {createdAt && (
                        <p className="text-xs text-cardColor-2">
                            <span className="font-font1 font-semibold text-[0.7rem] md:text[0.75rem] lg:text-[0.85rem] tracking-normal">
                                Created At:
                                <span className="ml-1 font-medium tracking-wider ">
                                    {new Date(createdAt).toLocaleDateString()}
                                </span>
                            </span> 
                        </p>
                    )}
                </CardFooter>
            </ShadcnCard>

            {updateModal && 
            <ContentForm 
                onClose={() => setUpdateModal(false)} 
                mainTitle="Update Content" 
                initialData={{ title, type, tags, link, contentId, createdAt }}
                updateModal={updateModal}
            />
            }
        </motion.div>
    );
};

export default Card;
