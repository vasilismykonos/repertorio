--
-- PostgreSQL database dump
--

\restrict dsBTJXeRliyCd9t5wTRWy4ZZ1mpvDwh3AAeb2Cu2uiNXePpEBsVceWu9rniY2xD

-- Dumped from database version 16.11
-- Dumped by pg_dump version 16.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: SongStatus; Type: TYPE; Schema: public; Owner: rep_user
--

CREATE TYPE public."SongStatus" AS ENUM (
    'DRAFT',
    'PENDING_APPROVAL',
    'PUBLISHED',
    'ARCHIVED'
);


ALTER TYPE public."SongStatus" OWNER TO rep_user;

--
-- Name: UserRole; Type: TYPE; Schema: public; Owner: rep_user
--

CREATE TYPE public."UserRole" AS ENUM (
    'ADMIN',
    'EDITOR',
    'AUTHOR',
    'CONTRIBUTOR',
    'SUBSCRIBER',
    'USER'
);


ALTER TYPE public."UserRole" OWNER TO rep_user;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Artist; Type: TABLE; Schema: public; Owner: rep_user
--

CREATE TABLE public."Artist" (
    id integer NOT NULL,
    "legacyArtistId" integer,
    title text NOT NULL,
    "firstName" text,
    "lastName" text,
    sex text,
    "bornYear" integer,
    "dieYear" integer,
    "imageUrl" text,
    biography text,
    "wikiUrl" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Artist" OWNER TO rep_user;

--
-- Name: Artist_id_seq; Type: SEQUENCE; Schema: public; Owner: rep_user
--

CREATE SEQUENCE public."Artist_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."Artist_id_seq" OWNER TO rep_user;

--
-- Name: Artist_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: rep_user
--

ALTER SEQUENCE public."Artist_id_seq" OWNED BY public."Artist".id;


--
-- Name: Category; Type: TABLE; Schema: public; Owner: rep_user
--

CREATE TABLE public."Category" (
    id integer NOT NULL,
    title text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Category" OWNER TO rep_user;

--
-- Name: Category_id_seq; Type: SEQUENCE; Schema: public; Owner: rep_user
--

CREATE SEQUENCE public."Category_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."Category_id_seq" OWNER TO rep_user;

--
-- Name: Category_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: rep_user
--

ALTER SEQUENCE public."Category_id_seq" OWNED BY public."Category".id;


--
-- Name: List; Type: TABLE; Schema: public; Owner: rep_user
--

CREATE TABLE public."List" (
    id integer NOT NULL,
    "legacyId" integer,
    title text NOT NULL,
    "groupId" integer,
    "ownerWpId" integer,
    "viewWpIds" text,
    "editWpIds" text,
    marked boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."List" OWNER TO rep_user;

--
-- Name: ListGroup; Type: TABLE; Schema: public; Owner: rep_user
--

CREATE TABLE public."ListGroup" (
    id integer NOT NULL,
    "legacyId" integer,
    title text NOT NULL,
    "fullTitle" text,
    "ownerWpId" integer,
    "viewWpIds" text,
    "editWpIds" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."ListGroup" OWNER TO rep_user;

--
-- Name: ListGroup_id_seq; Type: SEQUENCE; Schema: public; Owner: rep_user
--

CREATE SEQUENCE public."ListGroup_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."ListGroup_id_seq" OWNER TO rep_user;

--
-- Name: ListGroup_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: rep_user
--

ALTER SEQUENCE public."ListGroup_id_seq" OWNED BY public."ListGroup".id;


--
-- Name: ListItem; Type: TABLE; Schema: public; Owner: rep_user
--

CREATE TABLE public."ListItem" (
    id integer NOT NULL,
    "legacyId" integer,
    "listId" integer NOT NULL,
    "sortId" integer DEFAULT 0 NOT NULL,
    notes text,
    transport integer DEFAULT 0 NOT NULL,
    title text NOT NULL,
    chords text,
    lyrics text,
    "songId" integer
);


ALTER TABLE public."ListItem" OWNER TO rep_user;

--
-- Name: ListItem_id_seq; Type: SEQUENCE; Schema: public; Owner: rep_user
--

CREATE SEQUENCE public."ListItem_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."ListItem_id_seq" OWNER TO rep_user;

--
-- Name: ListItem_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: rep_user
--

ALTER SEQUENCE public."ListItem_id_seq" OWNED BY public."ListItem".id;


--
-- Name: List_id_seq; Type: SEQUENCE; Schema: public; Owner: rep_user
--

CREATE SEQUENCE public."List_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."List_id_seq" OWNER TO rep_user;

--
-- Name: List_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: rep_user
--

ALTER SEQUENCE public."List_id_seq" OWNED BY public."List".id;


--
-- Name: Makam; Type: TABLE; Schema: public; Owner: rep_user
--

CREATE TABLE public."Makam" (
    id integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    title text NOT NULL
);


ALTER TABLE public."Makam" OWNER TO rep_user;

--
-- Name: Makam_id_seq; Type: SEQUENCE; Schema: public; Owner: rep_user
--

CREATE SEQUENCE public."Makam_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."Makam_id_seq" OWNER TO rep_user;

--
-- Name: Makam_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: rep_user
--

ALTER SEQUENCE public."Makam_id_seq" OWNED BY public."Makam".id;


--
-- Name: Rythm; Type: TABLE; Schema: public; Owner: rep_user
--

CREATE TABLE public."Rythm" (
    id integer NOT NULL,
    title text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Rythm" OWNER TO rep_user;

--
-- Name: Rythm_id_seq; Type: SEQUENCE; Schema: public; Owner: rep_user
--

CREATE SEQUENCE public."Rythm_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."Rythm_id_seq" OWNER TO rep_user;

--
-- Name: Rythm_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: rep_user
--

ALTER SEQUENCE public."Rythm_id_seq" OWNED BY public."Rythm".id;


--
-- Name: Song; Type: TABLE; Schema: public; Owner: rep_user
--

CREATE TABLE public."Song" (
    id integer NOT NULL,
    title text NOT NULL,
    "firstLyrics" text,
    lyrics text,
    chords text,
    characteristics text,
    status public."SongStatus" DEFAULT 'PENDING_APPROVAL'::public."SongStatus" NOT NULL,
    "originalKey" text,
    "defaultKey" text,
    "basedOn" text,
    "scoreFile" text,
    "highestVocalNote" text,
    views integer DEFAULT 0 NOT NULL,
    "legacySongId" integer,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "createdByUserId" integer,
    "categoryId" integer,
    "rythmId" integer,
    "makamId" integer,
    "composerId" integer,
    "lyricistId" integer,
    "legacySongIdOld" integer
);


ALTER TABLE public."Song" OWNER TO rep_user;

--
-- Name: SongVersion; Type: TABLE; Schema: public; Owner: rep_user
--

CREATE TABLE public."SongVersion" (
    id integer NOT NULL,
    "songId" integer NOT NULL,
    title text,
    year integer,
    "youtubeUrl" text,
    "youtubeSearch" text,
    "playerCode" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdByUserId" integer,
    "singerFront" text,
    "singerBack" text,
    solist text,
    musicians text,
    "legacyVersionId" integer
);


ALTER TABLE public."SongVersion" OWNER TO rep_user;

--
-- Name: SongVersion_id_seq; Type: SEQUENCE; Schema: public; Owner: rep_user
--

CREATE SEQUENCE public."SongVersion_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."SongVersion_id_seq" OWNER TO rep_user;

--
-- Name: SongVersion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: rep_user
--

ALTER SEQUENCE public."SongVersion_id_seq" OWNED BY public."SongVersion".id;


--
-- Name: Song_id_seq; Type: SEQUENCE; Schema: public; Owner: rep_user
--

CREATE SEQUENCE public."Song_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."Song_id_seq" OWNER TO rep_user;

--
-- Name: Song_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: rep_user
--

ALTER SEQUENCE public."Song_id_seq" OWNED BY public."Song".id;


--
-- Name: User; Type: TABLE; Schema: public; Owner: rep_user
--

CREATE TABLE public."User" (
    id integer NOT NULL,
    email text,
    username text,
    "displayName" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "currentUrl" text,
    "darkMode" boolean,
    devices text,
    "fontSize" integer,
    "hideChords" boolean,
    "hideInfo" boolean,
    "redirectField" text,
    role public."UserRole" DEFAULT 'USER'::public."UserRole" NOT NULL,
    rooms text,
    "userActivationKey" text,
    "userLogin" text,
    "userNicename" text,
    "userRoom" text,
    "userStatus" integer,
    "userUrl" text,
    "viewOtherUserChords" text,
    "wpId" integer
);


ALTER TABLE public."User" OWNER TO rep_user;

--
-- Name: User_id_seq; Type: SEQUENCE; Schema: public; Owner: rep_user
--

CREATE SEQUENCE public."User_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."User_id_seq" OWNER TO rep_user;

--
-- Name: User_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: rep_user
--

ALTER SEQUENCE public."User_id_seq" OWNED BY public."User".id;


--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: rep_user
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public._prisma_migrations OWNER TO rep_user;

--
-- Name: Artist id; Type: DEFAULT; Schema: public; Owner: rep_user
--

ALTER TABLE ONLY public."Artist" ALTER COLUMN id SET DEFAULT nextval('public."Artist_id_seq"'::regclass);


--
-- Name: Category id; Type: DEFAULT; Schema: public; Owner: rep_user
--

ALTER TABLE ONLY public."Category" ALTER COLUMN id SET DEFAULT nextval('public."Category_id_seq"'::regclass);


--
-- Name: List id; Type: DEFAULT; Schema: public; Owner: rep_user
--

ALTER TABLE ONLY public."List" ALTER COLUMN id SET DEFAULT nextval('public."List_id_seq"'::regclass);


--
-- Name: ListGroup id; Type: DEFAULT; Schema: public; Owner: rep_user
--

ALTER TABLE ONLY public."ListGroup" ALTER COLUMN id SET DEFAULT nextval('public."ListGroup_id_seq"'::regclass);


--
-- Name: ListItem id; Type: DEFAULT; Schema: public; Owner: rep_user
--

ALTER TABLE ONLY public."ListItem" ALTER COLUMN id SET DEFAULT nextval('public."ListItem_id_seq"'::regclass);


--
-- Name: Makam id; Type: DEFAULT; Schema: public; Owner: rep_user
--

ALTER TABLE ONLY public."Makam" ALTER COLUMN id SET DEFAULT nextval('public."Makam_id_seq"'::regclass);


--
-- Name: Rythm id; Type: DEFAULT; Schema: public; Owner: rep_user
--

ALTER TABLE ONLY public."Rythm" ALTER COLUMN id SET DEFAULT nextval('public."Rythm_id_seq"'::regclass);


--
-- Name: Song id; Type: DEFAULT; Schema: public; Owner: rep_user
--

ALTER TABLE ONLY public."Song" ALTER COLUMN id SET DEFAULT nextval('public."Song_id_seq"'::regclass);


--
-- Name: SongVersion id; Type: DEFAULT; Schema: public; Owner: rep_user
--

ALTER TABLE ONLY public."SongVersion" ALTER COLUMN id SET DEFAULT nextval('public."SongVersion_id_seq"'::regclass);


--
-- Name: User id; Type: DEFAULT; Schema: public; Owner: rep_user
--

ALTER TABLE ONLY public."User" ALTER COLUMN id SET DEFAULT nextval('public."User_id_seq"'::regclass);


--
-- Name: Artist Artist_pkey; Type: CONSTRAINT; Schema: public; Owner: rep_user
--

ALTER TABLE ONLY public."Artist"
    ADD CONSTRAINT "Artist_pkey" PRIMARY KEY (id);


--
-- Name: Category Category_pkey; Type: CONSTRAINT; Schema: public; Owner: rep_user
--

ALTER TABLE ONLY public."Category"
    ADD CONSTRAINT "Category_pkey" PRIMARY KEY (id);


--
-- Name: ListGroup ListGroup_pkey; Type: CONSTRAINT; Schema: public; Owner: rep_user
--

ALTER TABLE ONLY public."ListGroup"
    ADD CONSTRAINT "ListGroup_pkey" PRIMARY KEY (id);


--
-- Name: ListItem ListItem_pkey; Type: CONSTRAINT; Schema: public; Owner: rep_user
--

ALTER TABLE ONLY public."ListItem"
    ADD CONSTRAINT "ListItem_pkey" PRIMARY KEY (id);


--
-- Name: List List_pkey; Type: CONSTRAINT; Schema: public; Owner: rep_user
--

ALTER TABLE ONLY public."List"
    ADD CONSTRAINT "List_pkey" PRIMARY KEY (id);


--
-- Name: Makam Makam_pkey; Type: CONSTRAINT; Schema: public; Owner: rep_user
--

ALTER TABLE ONLY public."Makam"
    ADD CONSTRAINT "Makam_pkey" PRIMARY KEY (id);


--
-- Name: Rythm Rythm_pkey; Type: CONSTRAINT; Schema: public; Owner: rep_user
--

ALTER TABLE ONLY public."Rythm"
    ADD CONSTRAINT "Rythm_pkey" PRIMARY KEY (id);


--
-- Name: SongVersion SongVersion_pkey; Type: CONSTRAINT; Schema: public; Owner: rep_user
--

ALTER TABLE ONLY public."SongVersion"
    ADD CONSTRAINT "SongVersion_pkey" PRIMARY KEY (id);


--
-- Name: Song Song_pkey; Type: CONSTRAINT; Schema: public; Owner: rep_user
--

ALTER TABLE ONLY public."Song"
    ADD CONSTRAINT "Song_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: rep_user
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: rep_user
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: Artist_legacyArtistId_key; Type: INDEX; Schema: public; Owner: rep_user
--

CREATE UNIQUE INDEX "Artist_legacyArtistId_key" ON public."Artist" USING btree ("legacyArtistId");


--
-- Name: Category_title_key; Type: INDEX; Schema: public; Owner: rep_user
--

CREATE UNIQUE INDEX "Category_title_key" ON public."Category" USING btree (title);


--
-- Name: ListGroup_legacyId_key; Type: INDEX; Schema: public; Owner: rep_user
--

CREATE UNIQUE INDEX "ListGroup_legacyId_key" ON public."ListGroup" USING btree ("legacyId");


--
-- Name: ListItem_legacyId_key; Type: INDEX; Schema: public; Owner: rep_user
--

CREATE UNIQUE INDEX "ListItem_legacyId_key" ON public."ListItem" USING btree ("legacyId");


--
-- Name: ListItem_listId_idx; Type: INDEX; Schema: public; Owner: rep_user
--

CREATE INDEX "ListItem_listId_idx" ON public."ListItem" USING btree ("listId");


--
-- Name: ListItem_songId_idx; Type: INDEX; Schema: public; Owner: rep_user
--

CREATE INDEX "ListItem_songId_idx" ON public."ListItem" USING btree ("songId");


--
-- Name: List_legacyId_key; Type: INDEX; Schema: public; Owner: rep_user
--

CREATE UNIQUE INDEX "List_legacyId_key" ON public."List" USING btree ("legacyId");


--
-- Name: Makam_title_key; Type: INDEX; Schema: public; Owner: rep_user
--

CREATE UNIQUE INDEX "Makam_title_key" ON public."Makam" USING btree (title);


--
-- Name: Rythm_title_key; Type: INDEX; Schema: public; Owner: rep_user
--

CREATE UNIQUE INDEX "Rythm_title_key" ON public."Rythm" USING btree (title);


--
-- Name: SongVersion_legacyVersionId_key; Type: INDEX; Schema: public; Owner: rep_user
--

CREATE UNIQUE INDEX "SongVersion_legacyVersionId_key" ON public."SongVersion" USING btree ("legacyVersionId");


--
-- Name: SongVersion_songId_idx; Type: INDEX; Schema: public; Owner: rep_user
--

CREATE INDEX "SongVersion_songId_idx" ON public."SongVersion" USING btree ("songId");


--
-- Name: Song_legacySongIdOld_key; Type: INDEX; Schema: public; Owner: rep_user
--

CREATE UNIQUE INDEX "Song_legacySongIdOld_key" ON public."Song" USING btree ("legacySongIdOld");


--
-- Name: Song_legacySongId_key; Type: INDEX; Schema: public; Owner: rep_user
--

CREATE UNIQUE INDEX "Song_legacySongId_key" ON public."Song" USING btree ("legacySongId");


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: rep_user
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);


--
-- Name: User_username_key; Type: INDEX; Schema: public; Owner: rep_user
--

CREATE UNIQUE INDEX "User_username_key" ON public."User" USING btree (username);


--
-- Name: User_wpId_key; Type: INDEX; Schema: public; Owner: rep_user
--

CREATE UNIQUE INDEX "User_wpId_key" ON public."User" USING btree ("wpId");


--
-- Name: ListItem ListItem_listId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: rep_user
--

ALTER TABLE ONLY public."ListItem"
    ADD CONSTRAINT "ListItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES public."List"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ListItem ListItem_songId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: rep_user
--

ALTER TABLE ONLY public."ListItem"
    ADD CONSTRAINT "ListItem_songId_fkey" FOREIGN KEY ("songId") REFERENCES public."Song"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: List List_groupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: rep_user
--

ALTER TABLE ONLY public."List"
    ADD CONSTRAINT "List_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES public."ListGroup"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: SongVersion SongVersion_createdByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: rep_user
--

ALTER TABLE ONLY public."SongVersion"
    ADD CONSTRAINT "SongVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: SongVersion SongVersion_songId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: rep_user
--

ALTER TABLE ONLY public."SongVersion"
    ADD CONSTRAINT "SongVersion_songId_fkey" FOREIGN KEY ("songId") REFERENCES public."Song"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Song Song_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: rep_user
--

ALTER TABLE ONLY public."Song"
    ADD CONSTRAINT "Song_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public."Category"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Song Song_composerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: rep_user
--

ALTER TABLE ONLY public."Song"
    ADD CONSTRAINT "Song_composerId_fkey" FOREIGN KEY ("composerId") REFERENCES public."Artist"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Song Song_createdByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: rep_user
--

ALTER TABLE ONLY public."Song"
    ADD CONSTRAINT "Song_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Song Song_lyricistId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: rep_user
--

ALTER TABLE ONLY public."Song"
    ADD CONSTRAINT "Song_lyricistId_fkey" FOREIGN KEY ("lyricistId") REFERENCES public."Artist"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Song Song_makamId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: rep_user
--

ALTER TABLE ONLY public."Song"
    ADD CONSTRAINT "Song_makamId_fkey" FOREIGN KEY ("makamId") REFERENCES public."Makam"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Song Song_rythmId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: rep_user
--

ALTER TABLE ONLY public."Song"
    ADD CONSTRAINT "Song_rythmId_fkey" FOREIGN KEY ("rythmId") REFERENCES public."Rythm"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict dsBTJXeRliyCd9t5wTRWy4ZZ1mpvDwh3AAeb2Cu2uiNXePpEBsVceWu9rniY2xD

