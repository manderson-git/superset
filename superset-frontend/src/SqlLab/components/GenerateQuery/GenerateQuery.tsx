import React, { useState, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import SyntaxHighlighter from 'react-syntax-highlighter/dist/cjs/light';
import sql from 'react-syntax-highlighter/dist/cjs/languages/hljs/sql';
import github from 'react-syntax-highlighter/dist/cjs/styles/hljs/github';

import Loading from 'src/components/Loading';
import { updateQueryEditor } from 'src/SqlLab/actions/sqlLab';

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

/*

activity item 
{
  type: 'userRequest', 'systemResponse', 'action';
  userRequest: string;
  systemResponse: string;
  action: string;
}

*/

type ActivityType = 'userRequest' | 'systemResponse' | 'userAction';

interface Activity {
  type: ActivityType;
  userRequest?: string;
  systemQuery?: string;
  systemNotes?: string;
  userAction?: string;
}

interface GenerateResults {
  sqlQuery: string;
  aiText: string;
}

const callGenerateApi = async (question: string): GenerateResults => {
  // modify this to call the fix endpoint
  const response = await fetch(
    'https://sql-helper.m1finance.staging/generate',
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        user_question: question,
      }),
    },
  );

  const json = await response.json();

  return {
    sqlQuery: json.sql_query,
    aiText: json.ai_text,
  };

  /*

  const result: GenerateResults = {
    sqlQuery: `SELECT u.user_id, SUM(a.invest_aum) as total_ira_aum
    FROM users u
    JOIN accounts_invest a ON u.user_id = a.user_id
    WHERE a.account_registration = 'IRA'
    AND NOT EXISTS (
      SELECT 1 
      FROM accounts_invest 
      WHERE user_id = u.user_id
      AND account_registration != 'IRA'
    )
    GROUP BY u.user_id`,
    aiText: `This query joins the users table to the accounts_invest table to get invest account information. It filters for only IRA accounts using the account_registration field. 

    The NOT EXISTS piece ensures we only include users who have IRA accounts and no other account types.
    
    Finally, it sums the invest_aum for all IRA accounts for a given user to get their total IRA AUM.`,
  };
  */
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
  const editor = useSelector(state => state.sqlLab.queryEditors[0]);
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
    dispatch(updateQueryEditor({ remoteId: editor.remoteId, sql: query }));
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

    const result = await callGenerateApi(request);

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

    /*
    setActivity([
      ...activity,
      {
        type: 'userRequest',
        userRequest: request,
      },
    ]);
    setTimeout(() => {
      setIsLoading(false);
      setActivity([
        ...activity,
        {
          type: 'userRequest',
          userRequest: request,
        },
        {
          type: 'systemResponse',
          systemResponse: 'SELECT awesome FROM system LIMIT 1000',
        },
      ]);
    }, 1500);
    */

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
