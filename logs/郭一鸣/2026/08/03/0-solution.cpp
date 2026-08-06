#include<iostream>
using namespace std;
int main()
{
    int t;
    cin>>t;
    while(t--)
    {
        int n;
        string s;
        cin>>n>>s;
        int num=1;
        for(int i=1;i<n;i++)
        {
            if(s[i]!=s[i-1])num++;
        }
        int del=0;
        for(int i=1;i<=n-2;i++)
        {
            if(s[i]!=s[i-1]&&s[i]!=s[i+1])
            {
                if(s[i-1]==s[i+1])del=2;
                else if(del==0)del=1;
            }
        }
        cout<<num-del<<endl;
    }
    return 0;
}