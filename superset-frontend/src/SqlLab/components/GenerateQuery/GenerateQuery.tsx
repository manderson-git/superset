import React, { useState, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import SyntaxHighlighter from 'react-syntax-highlighter/dist/cjs/light';
import sql from 'react-syntax-highlighter/dist/cjs/languages/hljs/sql';
import github from 'react-syntax-highlighter/dist/cjs/styles/hljs/github';

import Loading from 'src/components/Loading';
import {
  updateQueryEditor,
  updateUnsavedQuery,
} from 'src/SqlLab/actions/sqlLab';

import type { DatabaseObject } from 'src/features/databases/types';
import { Row, Col } from 'src/components';
import { Input, TextArea } from 'src/components/Input';
import { t, styled } from '@superset-ui/core';
import Button from 'src/components/Button';
import { Menu } from 'src/components/Menu';
import { Form, FormItem } from 'src/components/Form';
import Modal from 'src/components/Modal';
import SaveDatasetActionButton from 'src/SqlLab/components/SaveDatasetActionButton';
import {
  SaveDatasetModal,
  ISaveableDatasource,
} from 'src/SqlLab/components/SaveDatasetModal';
import { getDatasourceAsSaveableDataset } from 'src/utils/datasourceUtils';
import useQueryEditor from 'src/SqlLab/hooks/useQueryEditor';
import { QueryEditor } from 'src/SqlLab/types';
import _ from 'lodash';

interface ValidateQueryProps {
  queryEditorId: string;
  columns: ISaveableDatasource['columns'];
  onSave: (arg0: QueryPayload, id: string) => void;
  onUpdate: (arg0: QueryPayload, id: string) => void;
  saveQueryWarning: string | null;
  database: Partial<DatabaseObject> | undefined;
}

export type QueryPayload = {
  name: string;
  description?: string;
  id?: string;
  remoteId?: number;
} & Pick<QueryEditor, 'dbId' | 'schema' | 'sql'>;

const Styles = styled.span`
  span[role='img'] {
    display: flex;
    margin: 0;
    color: ${({ theme }) => theme.colors.grayscale.base};
    svg {
      vertical-align: -${({ theme }) => theme.gridUnit * 1.25}px;
      margin: 0;
    }
  }
`;

type ActivityType = 'userRequest' | 'systemResponse' | 'userAction';

interface Activity {
  type: ActivityType;
  userRequest?: string;
  systemQuery?: string;
  systemNotes?: string;
  userAction?: string;
}

const buildQuery = (query: string, activity: Activity[]) => {
  if (activity.length === 0) {
    return query;
  }

  const x = activity.map((item, index) => {
    const prompt =
      index === 0
        ? ''
        : item.type === 'systemResponse'
        ? 'Assistant:'
        : 'Human:';

    const text =
      item.type === 'systemResponse'
        ? `<query>${item.systemQuery}</query> ${item.systemNotes}`
        : item.type === 'userRequest'
        ? item.userRequest
        : '';

    return `${prompt}${text}`;
  });

  x.push(`Human: ${query}`);

  return x.join('/n/n');
};

const callGenerateApi = async (question: string, activity: Activity[]) => {
  const queryWithHistory = buildQuery(
    question.replace(/^\s+|\s+$/g, ''), // remove line breaks from beginning / end
    activity,
  );

  const response = await fetch(
    'https://sql-helper.m1finance.staging/generate',
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        user_question: queryWithHistory,
      }),
    },
  );

  const json = await response.json();

  await setTimeout(() => null, 200);
  return {
    sqlQuery: json.sql_query,
    aiText: json.ai_text,
  };
};

const GenerateQuery = ({
  queryEditorId,
  onSave = () => {},
  onUpdate,
  saveQueryWarning,
  database,
  columns,
}: ValidateQueryProps) => {
  const dispatch = useDispatch();
  const editors = useSelector(state => state.sqlLab.queryEditors);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const [showModal, setShowModal] = useState(false);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [request, setRequest] = useState('');

  const onTextAreaChange = (props: any) => {
    setRequest(props.target.value);
  };

  const onCopyToClipboard = (q: string) => {
    navigator.clipboard.writeText(q);
  };

  const onClose = () => {
    setShowModal(false);
  };

  const onReset = () => {
    setActivity([]);
    setRequest('');
    setIsLoading(false);
  };

  const onApplyQuery = (query: string) => {
    editors.forEach((editor: any) => {
      dispatch(updateQueryEditor({ remoteId: editor.remoteId, sql: query }));
    });
    dispatch(updateUnsavedQuery(query));

    setActivity([
      ...activity,
      {
        type: 'userAction',
        userAction: query,
      },
    ]);
  };

  const onUserRequest = async () => {
    setIsLoading(true);

    const result = await callGenerateApi(request, activity);

    setIsLoading(false);
    setActivity([
      ...activity,
      {
        type: 'userRequest',
        userRequest: request,
      },
      {
        type: 'systemResponse',
        systemQuery: result.sqlQuery,
        systemNotes: result.aiText,
      },
    ]);
    setRequest('');
  };

  return (
    <div>
      <Button
        style={{ height: 32, padding: '4px 15px' }}
        onClick={() => {
          setShowModal(true);
        }}
        key="validate-btn"
        tooltip="Generate Query"
        disabled={false}
      >
        Generate
      </Button>
      <Modal
        className="save-query-modal"
        onHandledPrimaryAction={onUserRequest}
        onHide={onClose}
        primaryButtonName="Send request"
        width="620px"
        show={showModal}
        title={<h4>{t('Generate SQL')}</h4>}
        footer={
          <>
            <Button onClick={onReset} cta>
              {t('Reset')}
            </Button>
            <Button onClick={onClose} data-test="cancel-query" cta>
              {t('Close')}
            </Button>
            <Button
              buttonStyle="primary"
              onClick={onUserRequest}
              className="m-r-3"
              cta
            >
              {t('Send request')}
            </Button>
          </>
        }
      >
        <div>
          <div>
            {activity.map(item => {
              switch (item.type) {
                case 'userRequest':
                  return (
                    <div
                      style={{
                        padding: '4px',
                      }}
                    >
                      <div style={{ color: '#777', fontSize: '10px' }}>
                        You wrote:
                      </div>
                      <div
                        style={{
                          border: 'solid 1px #ccc',
                          backgroundColor: '#eee',
                          padding: '8px',
                          marginBottom: '8px',
                        }}
                      >
                        {item.userRequest}
                      </div>
                    </div>
                  );
                case 'systemResponse':
                  return (
                    <div
                      style={{
                        padding: '4px',
                      }}
                    >
                      <div style={{ color: '#777', fontSize: '10px' }}>
                        System response:
                      </div>
                      <div
                        style={{
                          border: 'solid 1px #ccc',
                          backgroundColor: '#eee',
                          padding: '8px',
                          marginBottom: '8px',
                        }}
                      >
                        <SyntaxHighlighter language="sql" style={github}>
                          {item.systemQuery}
                        </SyntaxHighlighter>
                        <pre>{item.systemNotes}</pre>
                        <div>
                          <Button
                            onClick={() =>
                              onCopyToClipboard(item.systemQuery ?? '')
                            }
                          >
                            {t('Copy to clipboard')}
                          </Button>
                          <Button
                            onClick={() => onApplyQuery(item.systemQuery ?? '')}
                          >
                            {t('Apply query')}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                case 'userAction':
                  return (
                    <div
                      style={{
                        padding: '4px',
                      }}
                    >
                      <div style={{ color: '#777', fontSize: '10px' }}>
                        You updated your editor with the following query:
                      </div>
                      <div
                        style={{
                          border: 'solid 1px #ccc',
                          backgroundColor: '#eee',
                          padding: '8px',
                          marginBottom: '8px',
                        }}
                      >
                        <SyntaxHighlighter language="sql" style={github}>
                          {item.userAction}
                        </SyntaxHighlighter>
                      </div>
                    </div>
                  );
                default:
                  return null;
              }
            })}
            {isLoading === true ? (
              <div style={{ height: '80px', padding: '8px' }}>
                <Loading position="inline-centered" />
              </div>
            ) : null}
          </div>
          <div style={{ padding: '8px 0px' }}>
            Describe the data you are looking for, and we will generate a query
            for you.
          </div>
          <div>
            <TextArea rows={4} value={request} onChange={onTextAreaChange} />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default GenerateQuery;
