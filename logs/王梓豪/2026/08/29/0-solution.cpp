#include <bits/stdc++.h>
using namespace std;
int main()
{
    int n,t;
    cin>>n>>t;
    vector<vector<char>> a(n,vector<char>(t));
    for(int i=0;i<n;i++)
    {
        for(int j=0;j<t;j++)
        {
            cin>>a[i][j];
            if(a[i][j]=='?')a[i][j]='0';
        }
    }
    int b[3]={0,1,-1};
    for(int i=0;i<n;i++)
    {
        for(int j=0;j<t;j++)
        {
            for(int s=0;s<3;s++)
            {
                for(int m=0;m<3;m++)
                {
                    if(b[s]==b[m]&&b[s]==0)
                    continue;
                    if(a[i][j]=='*') continue;
                    else if(i+b[s]>=0&&i+b[s]<n&&j+b[m]>=0&&j+b[m]<t&&
                       a[i+b[s]][j+b[m]]=='*')
                        a[i][j]++;
                        
                }
            }
        }
    }
    for(int i=0;i<n;i++)
    {
        for(int j=0;j<t;j++)
        {
            cout<<a[i][j];
        }
        cout<<endl;
    }
}