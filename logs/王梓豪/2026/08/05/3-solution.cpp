#include<iostream>
#include<vector>
#include<algorithm>
using namespace std;
int main()
{
    int t;
    cin>>t; 
    while(t--)
    {
        int n;
        cin>>n;
        string a,b;
        cin>>a>>b;
        int cnta0=0,cnta1=0;
        int cntb0=0,cntb1=0;
        vector<int> va10,vb10,va11,vb11;
        for(int i=0;i<n;i+=2)
        {
            if(a[i]=='1')
            cnta0++;
            if(b[i]=='1')
            cntb0++;
            if(a[i]=='1')
            va10.push_back(i);
            if(b[i]=='1')
            vb10.push_back(i);
        }
        for(int i=1;i<n;i+=2)
        {
            if(a[i]=='1')
            cnta1++;
            if(b[i]=='1')
            cntb1++;
            if(a[i]=='1')
            va11.push_back(i);
            if(b[i]=='1')
            vb11.push_back(i);
        }
        sort(va10.begin(),va10.end());
        sort(vb10.begin(),vb10.end());
        sort(va11.begin(),va11.end());
        sort(vb11.begin(),vb11.end());
        long long ans=0;
        if(cnta0==cntb0 && cnta1==cntb1)
        {   for(int i=0;i<va10.size();i++)
        {
            ans+=abs(vb10[i]-va10[i])/2;
        }
        for(int i=0;i<va11.size();i++)
        {
            ans+=abs(vb11[i]-va11[i])/2;
        }
            cout<<ans<<endl;
        }
        else
        {
            cout<<-1<<endl;
        }
    }
}