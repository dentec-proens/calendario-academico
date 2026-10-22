// Explicit domain columns are authoritative. `record_properties` retains only
// extension fields and unstructured extraction metadata without JSON documents.
const text='text',num='double precision',int='integer',bool='boolean',texts='text[]',ints='integer[]';
export const relations={
 users:{fields:{id:text,name:text,email:text,role:text,campusId:text,active:bool,loginMethod:text,salt:text,hash:text,googleSubject:text,googleLastLoginAt:text,removedAt:text,inviteExpiresAt:num}},
 campuses:{fields:{id:text,name:text,archived:bool}},
 calendars:{fields:{id:text,campusId:text,purpose:text,name:text,courses:text,classes:text,shifts:text,version:int,catalogueRevision:int,updatedAt:text,deletedAt:text,deletedBy:text,restoredAt:text,restoredBy:text,definitiveAt:text,definitiveBy:text},children:{state:['calendar_states','one'],versions:['calendar_revisions','many'],institutionalSnapshot:['institutional_events','many'],documentSnapshot:['document_snapshots','many']}},
 calendar_revisions:{fields:{version:int,at:text,catalogueRevision:int},children:{state:['calendar_states','one'],institutionalEvents:['institutional_events','many'],documentSnapshot:['document_snapshots','many']}},
 calendar_states:{fields:{schemaVersion:int,year:int,campus:text,offer:text,regime:text,weekdays:ints,weekConfirmed:bool,weekEvidence:text,assessmentStages:int,secondSemesterIntake:bool,teacherDayDate:text,ignoredHistory:texts},children:{periods:['calendar_periods','many'],events:['calendar_events','many'],modalities:['calendar_modalities','values'],assessmentStagesByModality:['assessment_settings','map'],teacherVacations:['teacher_vacations','one']}},
 calendar_periods:{fields:{id:text,name:text,start:text,end:text,targetDays:int}},
 calendar_events:{fields:{id:text,name:text,start:text,end:text,kind:text,category:text,evidence:text,offers:texts,modalities:texts,requirementId:text,hours:num,assessmentAutoStart:text,institutional:bool,active:bool},children:{historicalSource:['event_historical_sources','one']}},
 institutional_events:{fields:{id:text,name:text,start:text,end:text,kind:text,category:text,evidence:text,offers:texts,modalities:texts,requirementId:text,hours:num,assessmentAutoStart:text,institutional:bool,active:bool}},
 calendar_modalities:{fields:{value:text}},
 assessment_settings:{fields:{modality:text,stages:int}},
 teacher_vacations:{fields:{firstStart:text,firstEnd:text,secondStart:text,secondEnd:text,thirdStart:text,thirdEnd:text,julyStart:text,januaryStart:text,januaryEnd:text,julyEnd:text,total:int,evidence:text}},
 event_historical_sources:{fields:{historyId:text,page:int,candidateKey:text}},
 histories:{fields:{id:text,calendarId:text,campusId:text,year:int,offer:text,filename:text,hash:text,notes:text,createdAt:text,objectKey:text,data:'bytea'},children:{analysis:['history_analyses','one']}},
 history_analyses:{fields:{version:int,truncated:bool,needsText:bool,analyzedAt:text},children:{pages:['history_pages','many'],candidates:['history_candidates','many']}},
 history_pages:{fields:{page:int,text:text}},
 history_candidates:{fields:{page:int,excerpt:text,name:text,likelyLocal:bool,category:text},children:{dates:['history_candidate_dates','one']}},
 history_candidate_dates:{fields:{start:text,end:text,name:text,startDay:int,startMonth:int,endDay:int,endMonth:int}},
 sessions:{fields:{id:text,userId:text,expires:num}},
 login_attempts:{fields:{id:text,count:int,until:num}},
 invitations:{fields:{tokenHash:text,userId:text,expiresAt:num,createdBy:text,createdAt:num,revoked:bool,usedAt:num}},
 password_resets:{fields:{hash:text,userId:text,expires:num,usedAt:num}},
 recovery_attempts:{fields:{key:text,count:int,until:num}},
 uploads:{fields:{id:text,owner:text,purpose:text,calendarId:text,filename:text,size:int,expires:num,path:text}},
 documents:{fields:{id:text,year:int,type:text,title:text,source:text,filename:text,size:int,hash:text,status:text,version:int,createdAt:text,createdBy:text,publishedAt:text,publishedBy:text,archivedAt:text,objectKey:text,data:'bytea'}},
 document_snapshots:{fields:{id:text,year:int,type:text,title:text,source:text,filename:text,size:int,hash:text,status:text,version:int,createdAt:text,createdBy:text,publishedAt:text,publishedBy:text,archivedAt:text,objectKey:text}},
 reviews:{fields:{calendarId:text,calendarVersion:int,catalogueRevision:int,revision:int,source:text,conclusion:text,processNumber:text,applicableNorm:text,updatedAt:text,officialApproval:bool},children:{reviewer:['reviewers','one'],documentSnapshot:['document_snapshots','many'],entries:['review_entries','many'],history:['review_history','many']}},
 review_history:{fields:{calendarId:text,calendarVersion:int,catalogueRevision:int,revision:int,source:text,conclusion:text,processNumber:text,applicableNorm:text,updatedAt:text,officialApproval:bool},children:{reviewer:['reviewers','one'],documentSnapshot:['document_snapshots','many'],entries:['review_entries','many']}},
 reviewers:{fields:{id:text,name:text}},
 review_entries:{fields:{id:text,status:text,notes:text,reviewed:bool,finding:text}},
 audit:{fields:{at:text,actor:text,action:text,id:text,version:int,campusId:text}},
 catalogue:{fields:{revision:int},children:{events:['catalogue_events','many']}},
 catalogue_events:{fields:{id:text,name:text,start:text,end:text,kind:text,category:text,evidence:text,offers:texts,modalities:texts,active:bool,requirementId:text,institutional:bool}}
};
export const rootRelations={users:'users',campuses:'campuses',calendars:'calendars',histories:'histories',audit:'audit',catalogue:'catalogue',sessions:'sessions',loginAttempts:'login_attempts',invitations:'invitations',passwordResets:'password_resets',recoveryAttempts:'recovery_attempts',uploads:'uploads',documents:'documents',reviews:'reviews'};
export const rootKeys={users:'id',campuses:'id',calendars:'id',histories:'id',sessions:'id',loginAttempts:'id',invitations:'tokenHash',passwordResets:'hash',recoveryAttempts:'key',uploads:'id',documents:'id',reviews:'calendarId'};
const quote=key=>'"'+key.replaceAll('"','""')+'"';
const foreignKeys=[
 ['users','campusId','campuses','id'],['calendars','campusId','campuses','id'],
 ['histories','calendarId','calendars','id'],['histories','campusId','campuses','id'],
 ['reviews','calendarId','calendars','id'],['sessions','userId','users','id'],
 ['invitations','userId','users','id'],['password_resets','userId','users','id'],
 ['uploads','calendarId','calendars','id'],['uploads','owner','users','id']
];
export const relationalStatements=[
 'CREATE SCHEMA IF NOT EXISTS dentec',
 'REVOKE ALL ON SCHEMA dentec FROM PUBLIC',
 'CREATE SEQUENCE IF NOT EXISTS dentec.entity_order',
 'CREATE TABLE IF NOT EXISTS dentec.schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
 'CREATE TABLE IF NOT EXISTS dentec.root_fields (name text PRIMARY KEY)',
 `CREATE TABLE IF NOT EXISTS dentec.record_properties (entity_type text NOT NULL,record_key text NOT NULL,path text[] NOT NULL,kind text NOT NULL CHECK (kind IN ('object','array','string','number','boolean','null','undefined')),text_value text,number_value double precision,boolean_value boolean,PRIMARY KEY(entity_type,record_key,path),CHECK ((kind='string' AND text_value IS NOT NULL AND number_value IS NULL AND boolean_value IS NULL) OR (kind='number' AND text_value IS NULL AND number_value IS NOT NULL AND boolean_value IS NULL) OR (kind='boolean' AND text_value IS NULL AND number_value IS NULL AND boolean_value IS NOT NULL) OR (kind IN ('object','array','null','undefined') AND text_value IS NULL AND number_value IS NULL AND boolean_value IS NULL)))`,
 ...Object.entries(relations).map(([name,descriptor])=>`CREATE TABLE IF NOT EXISTS dentec.${name} (_key text PRIMARY KEY,_parent text,_position integer NOT NULL DEFAULT 0,_order bigint NOT NULL DEFAULT nextval('dentec.entity_order'),_fields text[] NOT NULL,_undefined text[] NOT NULL DEFAULT '{}',${Object.entries(descriptor.fields).map(([field,type])=>`${quote(field)} ${type}`).join(',')})`),
 ...Object.keys(relations).map(name=>`CREATE INDEX IF NOT EXISTS ${name}_parent_idx ON dentec.${name} (_parent,_position)`),
 ...['users','campuses','calendars','histories','documents'].map(name=>`CREATE UNIQUE INDEX IF NOT EXISTS ${name}_id_unique ON dentec.${name} (id)`),
 'CREATE UNIQUE INDEX IF NOT EXISTS reviews_calendar_unique ON dentec.reviews (\"calendarId\")',
 ...foreignKeys.map(([table,column,target,targetColumn])=>`DO $constraint$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='dentec' AND c.conname='${table}_${column}_fk') THEN ALTER TABLE dentec.${table} ADD CONSTRAINT ${quote(table+'_'+column+'_fk')} FOREIGN KEY (${quote(column)}) REFERENCES dentec.${target} (${quote(targetColumn)}) DEFERRABLE INITIALLY DEFERRED; END IF; END $constraint$`),
 'CREATE INDEX IF NOT EXISTS users_campus_idx ON dentec.users (\"campusId\")',
 'CREATE INDEX IF NOT EXISTS uploads_calendar_idx ON dentec.uploads (\"calendarId\")',
 'CREATE INDEX IF NOT EXISTS calendars_campus_idx ON dentec.calendars ("campusId")',
 'CREATE UNIQUE INDEX IF NOT EXISTS users_active_email_idx ON dentec.users (email) WHERE "removedAt" IS NULL AND email IS NOT NULL',
 'CREATE INDEX IF NOT EXISTS histories_calendar_idx ON dentec.histories ("calendarId")',
 'CREATE INDEX IF NOT EXISTS histories_campus_idx ON dentec.histories ("campusId")',
 'CREATE INDEX IF NOT EXISTS reviews_calendar_idx ON dentec.reviews ("calendarId")',
 'CREATE INDEX IF NOT EXISTS sessions_user_idx ON dentec.sessions ("userId")',
 'CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON dentec.sessions (expires)',
 'CREATE INDEX IF NOT EXISTS password_resets_user_idx ON dentec.password_resets ("userId")',
 'CREATE INDEX IF NOT EXISTS invitations_user_idx ON dentec.invitations ("userId")',
 'CREATE INDEX IF NOT EXISTS uploads_owner_idx ON dentec.uploads (owner)',
 ...['schema_migrations','root_fields','record_properties',...Object.keys(relations)].flatMap(name=>[`REVOKE ALL ON dentec.${name} FROM PUBLIC`,`ALTER TABLE dentec.${name} ENABLE ROW LEVEL SECURITY`]),
 'REVOKE ALL ON SEQUENCE dentec.entity_order FROM PUBLIC',
 'INSERT INTO dentec.schema_migrations (version) VALUES (1) ON CONFLICT DO NOTHING'
];
export const relationalSchemaSql=relationalStatements.join(';\n')+';\n';
