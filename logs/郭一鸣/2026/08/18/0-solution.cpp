#include<bits/stdc++.h>
using namespace std;
int main()
{
    int t;
    cin>>t;
    while(t--)
    {
        int n,m;
        cin>>n>>m;
        bool al[26]={false};
        string s;
        for(int i=1;i<=n;i++)
        {
            cin>>s;
            al[s[0]-'a']=true;
        }
        bool flag=true;
        for(int i=1;i<=m;i++)
        {
            cin>>s;
            for(int j=0;j<s.length();j++)
            {
                if(al[s[j]-'A']==false)
                {
                    flag=false;
                }
            }
        }
        if(flag)cout<<"YES"<<endl;
        else cout<<"NO"<<endl;
    }
    return 0;
}